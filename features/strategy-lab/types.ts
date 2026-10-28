import type { Paise } from "@/types/domain";

/**
 * Strategy Lab dataset contract (M1-A) — the stable bar/manifest shapes every
 * later M1 phase consumes.
 *
 * NSE cash-equity, daily OHLCV, delivery research. All money is integer paise;
 * volume is integer shares; dates are canonical `YYYY-MM-DD` Asia/Kolkata
 * trading days. No floats, no timestamps, no market-data provider types.
 */

/** One validated daily cash-equity bar. All fields required. */
export interface Bar {
  /** Trading date, canonical `YYYY-MM-DD`, Asia/Kolkata. */
  date: string;
  /** Exchange symbol. Must be a member of the dataset manifest universe. */
  symbol: string;
  /** Integer paise. Always > 0. */
  openPaise: Paise;
  /** Integer paise. Always >= open, close, low. */
  highPaise: Paise;
  /** Integer paise. Always <= open, close, high. Always > 0. */
  lowPaise: Paise;
  /** Integer paise. Always > 0. */
  closePaise: Paise;
  /** Integer shares traded. Always >= 0 and a safe integer. */
  volume: number;
}

/** Inclusive dataset span. Must equal the actual first/last bar dates. */
export interface DateRange {
  start: string;
  end: string;
}

/**
 * Provenance + integrity record for one versioned dataset. The manifest
 * describes the data; it is always verified against the data, never trusted.
 */
export interface DatasetManifest {
  datasetId: string;
  version: string;
  source: string;
  sourceReference: string;
  retrievedAt: string;
  /** Lowercase hex SHA-256 of the canonical CSV bytes. */
  sha256: string;
  timezone: string;
  session: string;
  barInterval: string;
  adjustment: string;
  /** M1 enforces exactly one symbol. */
  universe: readonly string[];
  dateRange: DateRange;
  /** Must equal the parsed data-row count. */
  rowCount: number;
}

/** Locked M1 dataset constants. Manifest fields must equal these exactly. */
export const STRATEGY_LAB_TIMEZONE = "Asia/Kolkata";
export const STRATEGY_LAB_SESSION = "09:15-15:30 Asia/Kolkata";
export const STRATEGY_LAB_BAR_INTERVAL = "1d";
export const STRATEGY_LAB_ADJUSTMENT = "split-bonus-adjusted; dividends excluded";

/** Product-wide money cap, consistent with the per-tool ₹100 crore boundary. */
export const STRATEGY_LAB_MAX_PAISE = 100_000_000_000;

/** Largest accepted share volume per bar. Well inside safe-integer range. */
export const STRATEGY_LAB_MAX_VOLUME = 1_000_000_000_000;

/** Frozen reference parameters for SLAB-STRAT-001. The only M1 parameter set. */
export interface StrategyParams {
  fastPeriod: number;
  slowPeriod: number;
  stopLookback: number;
  minBars: number;
}

/** Locked M1 reference set. No sweeps, no alternatives in M1. */
export const STRATEGY_LAB_REFERENCE_PARAMS: StrategyParams = {
  fastPeriod: 10,
  slowPeriod: 30,
  stopLookback: 20,
  minBars: 30,
};

/** Canonical CSV schema. Exactly one schema exists in M1. No quoted fields. */
export const STRATEGY_LAB_CSV_HEADER = "date,symbol,open,high,low,close,volume";
