// The rows one symbol's upstream fetch becomes: its price_cache row, its
// intraday snapshots and, once the session has printed a close, its
// daily_closes row. Pure and free of any database import — the same reason
// closing-price.ts is — so the rules that decide what gets stored as history
// can be tested without faking Finnhub, Yahoo and PostgREST together.

import { reconcileClose, reliableCloseDay } from "@/lib/closing-price";
import type { Quote } from "@/lib/finnhub";
import type { DayData } from "@/lib/yahoo";

const SNAPSHOT_MINUTES = 15;

export type PriceRow = {
  symbol: string;
  price: number;
  change: number;
  change_percent: number;
  volume: number | null;
  avg_volume: number | null;
  updated_at: string;
};

export type SnapshotRow = { symbol: string; price: number; volume: number | null; snapshot_at: string };

export type DailyCloseRow = {
  symbol: string;
  trading_day: string;
  close: number;
  change: number;
  change_percent: number;
};

/**
 * Snaps a bar to the 15-minute grid the schema documents. The upstream feed
 * appends a live, partially-formed bar stamped with the current time, so
 * without this every refresh would leave an extra off-grid point behind and the
 * snapshots would drift away from an even cadence.
 */
function snapshotSlot(at: Date): string {
  const slot = new Date(at);
  slot.setUTCSeconds(0, 0);
  slot.setUTCMinutes(Math.floor(slot.getUTCMinutes() / SNAPSHOT_MINUTES) * SNAPSHOT_MINUTES);
  return slot.toISOString();
}

export function deriveSymbolRows(input: {
  symbol: string;
  quote: Quote;
  day: DayData;
  avgVolume: number | null;
  now: Date;
}): { price: PriceRow; snapshots: SnapshotRow[]; dailyClose: DailyCloseRow | null } {
  const { symbol, quote, day, avgVolume, now } = input;

  // Once the session has printed a close, that print is what gets stored
  // rather than the live quote — Finnhub's has already moved on the liquid
  // names by the time the closing-window tick runs. Mid-session this is the
  // quote untouched. See lib/closing-price.ts for the measurement.
  const settled = reconcileClose(quote, day.bars);

  // Only a close reconcileClose actually substituted becomes history — see
  // reliableCloseDay. Idempotent: a repeated closing-window tick re-upserts
  // the same (symbol, trading_day) row, which only changes if a later tick
  // finds a better closing bar.
  const closeDay = reliableCloseDay(quote, day.bars);

  return {
    price: {
      symbol,
      price: settled.price,
      change: settled.change,
      change_percent: settled.changePercent,
      volume: day.volume,
      avg_volume: avgVolume,
      updated_at: now.toISOString(),
    },
    snapshots: day.bars.map((bar) => ({
      symbol,
      price: bar.price,
      volume: bar.volume,
      snapshot_at: snapshotSlot(bar.at),
    })),
    dailyClose: closeDay
      ? {
          symbol,
          trading_day: closeDay,
          close: settled.price,
          change: settled.change,
          change_percent: settled.changePercent,
        }
      : null,
  };
}
