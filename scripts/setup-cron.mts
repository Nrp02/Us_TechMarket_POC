// Provisions the Supabase Cron schedules that drive all ingestion.
// Run with: npm run setup-cron
//
// This is a script rather than a migration because the schedule needs the
// deployment URL and the shared secret, and a migration file would commit them
// to git. Secrets are read from .env.local and stored in Supabase Vault; the
// scheduled command reads them back out at run time, so nothing here or in the
// database's job definition contains a literal secret.
//
// Idempotent — safe to re-run after rotating the secret or changing the URL.
import pkg from "pg";

const { Client } = pkg;

const { CRON_SECRET, APP_BASE_URL, DATABASE_URL } = process.env;

if (!CRON_SECRET || !APP_BASE_URL) {
  console.error("CRON_SECRET and APP_BASE_URL must be set in .env.local");
  process.exit(1);
}

// The market-hours check lives in the endpoint (evaluated in America/New_York),
// so this window only has to be wide enough to contain the US session under
// both EST and EDT. A tighter UTC expression would drift by an hour at each DST
// changeover; a wider one just costs a few no-op ticks.
const JOBS = [
  {
    name: "intraday-snapshots",
    schedule: "*/15 13-21 * * 1-5",
    path: "/api/refresh",
  },
  // 8x/day. News ingestion has no market-hours gate, so a DST shift changes
  // nothing that matters here.
  //
  // Seven of the eight land before the daily-summaries window below, which is the
  // point: the end-of-day job can only summarise news that is already stored,
  // and under the old 4x schedule only three cycles ran first — the fourth was
  // at 01:00 UTC, after every summary tick. 21:00 UTC is the last one before
  // the window and sits at or after the close in both regimes (17:00 ET under
  // EDT, 16:00 ET under EST), so a stock's day is complete when it is written
  // up.
  //
  // 02:00 UTC is deliberately after the summary window. It exists to keep the
  // News page fresh through the Thai morning (09:00 ICT), which the old 01:00
  // UTC cycle was doing; the articles it stores belong to an ET day already
  // summarised, exactly as before.
  //
  // 07:00 and 10:00 UTC (14:00 and 17:00 ICT) close the gap that one left.
  // Between 02:00 and 12:00 UTC there was no cycle at all — ten hours, and they
  // are 09:00-19:00 ICT, the whole of the owner's own working day.
  //
  // The stronger reason is where the articles actually are, which was measured
  // rather than assumed and came out the opposite way round to the guess. That
  // window is US pre-market, not a quiet overnight: counting the publication
  // hour of all 664 stored articles, **47% of a day is published inside it**,
  // peaking at 11:00 UTC (52) and 08:00 UTC (48). Nothing was lost — the noon
  // cycle eventually swept them up — but half the day's news was invisible on
  // the site for up to ten hours.
  //
  // The slots are picked by which one shrinks the largest waiting bucket, not
  // by spacing. Articles published in an hour are stored by the first cycle
  // after it, so each cycle owns a bucket; the largest was 312 articles before
  // 07:00 was added, 206 after, and 133 once 10:00 joined it.
  //
  // Cycle count is also the ceiling on summarisation, which is the second
  // constraint and the one that was actually being hit: MAX_PER_CYCLE is 25, so
  // seven cycles could summarise at most 175 articles a day against real days
  // of 166 — and coverage had already slipped to 87-89% on 2026-08-16 and
  // 2026-08-19. Eight cycles lift the ceiling to 200.
  {
    name: "news-ingest",
    schedule: "0 7,10,12,15,18,20,21,2 * * *",
    path: "/api/ingest-news",
  },
  // End-of-day Today's Activity summaries. Each run summarises the next couple
  // of watchlist symbols that still lack one, so the list finishes across
  // several runs rather than in a single call that would overrun the 60s
  // function limit; the spare runs also absorb the model's intermittent 503s.
  //
  // 22:05-23:55 UTC is 17:05-18:55 ET under EST and 18:05-19:55 ET under EDT —
  // after the close in both, which is what the handler's own America/New_York
  // check enforces, and still the same ET date, so the price_cache staleness
  // gate also passes.
  //
  // It was 21:05, five minutes after the 21:00 news cycle it depends on. That
  // was too tight to be a sequencing guarantee and, more to the point, three
  // news cycles was never enough to have stored the day. Starting an hour after
  // the last pre-summary cycle is the clearance the dependency actually needed.
  // Still 12 ticks for 4 batches, so the retry headroom is unchanged.
  {
    name: "daily-summaries",
    schedule: "5-55/10 22-23 * * 1-5",
    path: "/api/daily-summary",
  },
  // Today's Story narrative — a second, independent job on the same window as
  // daily-summaries above (same post-close/staleness reasoning applies), but
  // its own cron entry because it calls a different provider (Groq, not
  // Gemini) and paces 2 stocks/tick rather than one 5-stock batch. 10 of the
  // 12 ticks cover all 20 Top-20 symbols; the spare 2 absorb a rate-limited or
  // failed stock. See src/lib/story-generation.ts.
  {
    name: "today-story",
    schedule: "5-55/10 22-23 * * 1-5",
    path: "/api/story",
  },
];

// A cold news cycle can take ~45s, so pg_net must outwait the function rather
// than aborting a run that is still working.
const REQUEST_TIMEOUT_MS = 60000;

const client = new Client({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

async function putSecret(name: string, value: string) {
  const { rows } = await client.query<{ id: string }>(
    "SELECT id FROM vault.secrets WHERE name = $1",
    [name],
  );
  if (rows.length) {
    await client.query("SELECT vault.update_secret($1, $2, $3)", [
      rows[0].id,
      value,
      name,
    ]);
    console.log(`vault  update ${name}`);
  } else {
    await client.query("SELECT vault.create_secret($1, $2)", [value, name]);
    console.log(`vault  create ${name}`);
  }
}

await putSecret("cron_secret", CRON_SECRET);
await putSecret("app_base_url", APP_BASE_URL);

for (const job of JOBS) {
  // cron.unschedule throws if the job is absent, so check first.
  const { rows } = await client.query(
    "SELECT 1 FROM cron.job WHERE jobname = $1",
    [job.name],
  );
  if (rows.length) await client.query("SELECT cron.unschedule($1)", [job.name]);

  const command = `
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'app_base_url')
             || '${job.path}',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' ||
          (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := ${REQUEST_TIMEOUT_MS}
    );`;

  await client.query("SELECT cron.schedule($1, $2, $3)", [
    job.name,
    job.schedule,
    command,
  ]);
  console.log(`cron   ${job.name}  ${job.schedule}  -> ${job.path}`);
}

const { rows: scheduled } = await client.query(
  "SELECT jobname, schedule, active FROM cron.job ORDER BY jobname",
);
console.table(scheduled);

await client.end();
