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
  // Twelve proposed cycles/day. Live schedules change only when this script is run.
  {
    name: "news-ingest",
    // 12 cycles/day, offset from refresh (:00/:15/:30/:45) and EOD (:05/:15/...).
    // Concurrency alone is not a requests/minute limiter.
    // Preserve 21:07: after the close under EST and EDT, before the 22:05 summary.
    schedule: "7 0,2,4,6,8,10,12,14,16,18,20,21 * * *",
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
  // Gemini) and paces one stock/tick. 20 of the
  // 48 ticks cover all Top-20 symbols; the spare ticks absorb a rate-limited or
  // failed stock. See src/lib/story-generation.ts.
  {
    name: "today-story",
    schedule: "0-55/5 20-23 * * 1-5",
    path: "/api/story",
  },
  // Opens every dated page once the new Session's first snapshot is in, so
  // yesterday's link (now `?date=`) is cached before a visitor asks for it.
  // 14:40 UTC is after the open under both EST and EDT. Nothing upstream: the
  // route reads Supabase only. See src/app/api/warm-cache/route.ts.
  {
    name: "warm-cache",
    schedule: "40 14 * * 1-5",
    path: "/api/warm-cache",
  },
];

// Job names given on the command line provision only those jobs
// (`npm run setup-cron -- warm-cache`), leaving every other schedule as it is.
const only = process.argv.slice(2);
const jobs = only.length ? JOBS.filter((job) => only.includes(job.name)) : JOBS;
if (only.length && jobs.length !== only.length) {
  console.error(`unknown job in: ${only.join(", ")}`);
  process.exit(1);
}

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

for (const job of jobs) {
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
