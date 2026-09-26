-- The `watchlist` table has had zero readers since Phase 4.5 replaced it with
-- a per-browser cookie (see CLAUDE.md's "Phase 4.5" section — readWatchlist()
-- in src/lib/watchlist.ts is the only source of truth now). It was
-- deliberately left in place at the time ("Left in place; drop it in a later
-- migration, not as part of this change") — this is that later migration.
DROP TABLE IF EXISTS watchlist;
