# Architecture decisions

One file per decision. Decisions 0002–0010 were recorded on 2026-10-10 from the code, the commit history and `docs/history/`; each states the date the decision was actually made. They are retrospective records, not contemporaneous ones.

| ADR | Decision | Decided |
|---|---|---|
| [0001](0001-closing-price-trend-detection.md) | Recent Trend uses closing prices | — |
| [0002](0002-supabase-cron-not-vercel-cron.md) | Supabase Cron, not Vercel Cron | 2026-08-14 |
| [0003](0003-pages-read-the-database-only.md) | Pages read the database only | 2026-08-14 |
| [0004](0004-failed-reads-throw.md) | A failed read throws | 2026-08-29 |
| [0005](0005-official-close-from-the-1600-bar.md) | Official close from the 16:00 bar | 2026-08-24 |
| [0006](0006-one-significant-movement-rule.md) | One Significant Movement rule | 2026-08-14 |
| [0007](0007-three-ai-providers-by-quota.md) | Three AI providers by quota | 2026-08-14 → 09-27 |
| [0008](0008-publish-stories-and-record-checks.md) | Publish stories, record checks | 2026-09-29 |
| [0009](0009-remove-the-watchlist.md) | Remove the watchlist | 2026-09-26 |
| [0010](0010-sector-wide-engine-label.md) | Sector-wide engine label | 2026-10-09 |

Other long-form reasoning, measurements and reversed decisions are in `docs/history/`, indexed by area in `CLAUDE.md`. The publish-versus-reject rule is also in `CLAUDE.md` under "AI Safety / Data Integrity Rules".
