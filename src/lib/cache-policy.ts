// Single source for the read-cache policy shared by queries.ts and queries-news.ts.

/**
 * How long a render may reuse the previous database read.
 *
 * Measured from inside the deployed function: a query returning one row costs
 * the same ~155ms as one returning 840, so the price is paid per request rather
 * than per row, and page time was almost exactly (number of queries that have to
 * run in sequence) × that cost. Re-reading on every render bought nothing,
 * because the ingestion jobs only write every 15 minutes — a window this far
 * inside that cadence cannot show a visitor figures from a different session
 * than the one already on screen.
 *
 * The reads cached here are all visitor-independent. The watchlist is a cookie
 * and never reaches this file except as an argument, which becomes part of the
 * cache key, so one visitor's selection can never be served to another.
 *
 * WHAT MAKES THIS SAFE IS THAT A FAILED READ THROWS. Every query below goes
 * through lib/db-read.ts, which retries and then raises rather than returning an
 * empty result — because `unstable_cache` writes no entry for a rejected
 * promise. The two are one mechanism: caching is what would otherwise make a
 * single transient failure durable, and throwing is what keeps the empty answer
 * out of the cache. This file previously read `{ data }` alone and could not
 * tell a failure from an empty table; one blip then blanked the sparklines for
 * every visitor for a full minute. Do not reintroduce a read that swallows.
 */
export const CACHE_SECONDS = 60;
