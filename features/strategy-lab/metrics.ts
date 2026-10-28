import type { Paise } from "@/types/domain";

import type { BacktestTrade } from "@/features/strategy-lab/backtester";
import {
  SENSITIVITY_REFERENCE_BPS,
  type SensitivityResult,
} from "@/features/strategy-lab/sensitivity";

/**
 * Strategy Lab research metrics (M1-E) — the source of truth for performance
 * metrics and the frozen IS/OOS split.
 *
 * Consumes complete M1-D sensitivity results and derives exact research
 * metrics per partition (all / IS / OOS) per leg (0 / 5 / 10 bps). Never
 * reimplements execution or economics: every paise value is read from M1-C
 * trade records. Pure and deterministic; inputs are never mutated.
 *
 * Frozen split SLAB-SPLIT-001: dataset `slab-sample-daily-001`,
 * `splitDate 2026-09-14`, whole-trade classification by `entryDate`
 * (`< splitDate` → IS, `>= splitDate` → OOS). Crossing trades stay whole in
 * their entry partition — never split, duplicated, or prorated. The split
 * is a deterministic fixture configuration, not a market-regime claim.
 */

/** Frozen SLAB-SPLIT-001 definition. Not configurable, not inferred. */
export const RESEARCH_SPLIT_ID = "SLAB-SPLIT-001" as const;
export const RESEARCH_SPLIT_DATASET_ID = "slab-sample-daily-001" as const;
export const RESEARCH_SPLIT_DATE = "2026-09-14" as const;

export type ResearchPartition = "is" | "oos";

/** Whole-trade classification by entry date. Canonical dates compare lexically. */
export function classifyTradePartition(entryDate: string): ResearchPartition {
  return entryDate < RESEARCH_SPLIT_DATE ? "is" : "oos";
}

/**
 * Exact rational metric value. `num`/`den` are the definition (never a
 * float); `decimal` is a deterministic 6-place display expansion only.
 */
export interface RationalValue {
  num: number;
  den: number;
  decimal: string;
}

export interface CostDrag {
  statutoryPaise: Paise;
  slippagePaise: Paise;
  totalPaise: Paise;
}

export interface PartitionMetrics {
  tradeCount: number;
  winCount: number;
  lossCount: number;
  flatCount: number;
  netPnlPaise: Paise;
  /** wins / completedTrades; null when there are no completed trades. */
  winRate: RationalValue | null;
  /** net / completedTrades; null when there are no completed trades. */
  expectancy: RationalValue | null;
  /** grossWin / grossLoss on slipped fills; null when undefined. */
  profitFactor: RationalValue | null;
  profitFactorNote: "ok" | "no-trades" | "no-losing-trades";
  maxDrawdownPaise: Paise;
  costDrag: CostDrag;
}

export interface LegMetrics {
  slippageBps: number;
  all: PartitionMetrics;
  is: PartitionMetrics;
  oos: PartitionMetrics;
}

export interface ResearchIssue {
  field: string;
  reason: string;
}

export type ResearchResult =
  | {
      status: "ok";
      splitId: typeof RESEARCH_SPLIT_ID;
      splitDate: typeof RESEARCH_SPLIT_DATE;
      referenceBps: typeof SENSITIVITY_REFERENCE_BPS;
      legs: readonly [LegMetrics, LegMetrics, LegMetrics];
      /** Headline: the 5 bps OOS partition. A reference, not a recalculation. */
      referenceOos: PartitionMetrics;
    }
  | { status: "invalid"; errors: ResearchIssue[] };

const DISPLAY_PLACES = 6;

function requireSafe(value: bigint, what: string): number {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new RangeError(`${what} exceeds safe integer range.`);
  }
  return Number(value);
}

/** Deterministic fixed-place decimal expansion (round-half-up) for display. */
function displayDecimal(num: bigint, den: bigint): string {
  const negative = num < 0n;
  const magnitude = negative ? -num : num;
  const scale = 10n ** BigInt(DISPLAY_PLACES);
  const rounded = (magnitude * scale * 10n + den * 5n) / (den * 10n);
  const int = rounded / scale;
  const frac = (rounded % scale).toString().padStart(DISPLAY_PLACES, "0");
  return `${negative ? "-" : ""}${int.toString()}.${frac}`;
}

function rational(num: bigint, den: bigint): RationalValue {
  return Object.freeze({
    num: requireSafe(num, "metric numerator"),
    den: requireSafe(den, "metric denominator"),
    decimal: displayDecimal(num, den),
  });
}

const EMPTY_PARTITION: PartitionMetrics = Object.freeze({
  tradeCount: 0,
  winCount: 0,
  lossCount: 0,
  flatCount: 0,
  netPnlPaise: 0 as Paise,
  winRate: null,
  expectancy: null,
  profitFactor: null,
  profitFactorNote: "no-trades",
  maxDrawdownPaise: 0 as Paise,
  costDrag: Object.freeze({
    statutoryPaise: 0 as Paise,
    slippagePaise: 0 as Paise,
    totalPaise: 0 as Paise,
  }),
});

function computePartition(trades: readonly BacktestTrade[]): PartitionMetrics {
  if (trades.length === 0) {
    return EMPTY_PARTITION;
  }

  let net = 0n;
  let grossWin = 0n;
  let grossLoss = 0n;
  let wins = 0;
  let losses = 0;
  let flats = 0;
  let statutory = 0n;
  let slippage = 0n;
  let equity = 0n;
  let peak = 0n;
  let maxDd = 0n;

  for (const trade of trades) {
    const tradeNet = BigInt(trade.netPnlPaise);
    const tradeGross = BigInt(trade.grossPnlPaise);
    net += tradeNet;
    if (tradeGross > 0n) {
      grossWin += tradeGross;
    } else if (tradeGross < 0n) {
      grossLoss += -tradeGross;
    }
    if (tradeNet > 0n) {
      wins += 1;
    } else if (tradeNet < 0n) {
      losses += 1;
    } else {
      flats += 1;
    }
    statutory += BigInt(trade.buyStatutoryPaise) + BigInt(trade.sellStatutoryPaise);
    slippage +=
      (BigInt(trade.entrySlippagePaise) + BigInt(trade.exitSlippagePaise)) * BigInt(trade.quantity);

    equity += tradeNet;
    if (equity > peak) {
      peak = equity;
    }
    const drawdown = peak - equity;
    if (drawdown > maxDd) {
      maxDd = drawdown;
    }
  }

  const count = BigInt(trades.length);
  return Object.freeze({
    tradeCount: trades.length,
    winCount: wins,
    lossCount: losses,
    flatCount: flats,
    netPnlPaise: requireSafe(net, "net P&L") as Paise,
    winRate: rational(BigInt(wins), count),
    expectancy: rational(net, count),
    profitFactor: grossLoss === 0n ? null : rational(grossWin, grossLoss),
    profitFactorNote: grossLoss === 0n ? ("no-losing-trades" as const) : ("ok" as const),
    maxDrawdownPaise: requireSafe(maxDd, "max drawdown") as Paise,
    costDrag: Object.freeze({
      statutoryPaise: requireSafe(statutory, "statutory drag") as Paise,
      slippagePaise: requireSafe(slippage, "slippage drag") as Paise,
      totalPaise: requireSafe(statutory + slippage, "total drag") as Paise,
    }),
  });
}

function toLegMetrics(slippageBps: number, trades: readonly BacktestTrade[]): LegMetrics {
  // M1-C emits trades in chronological exit order; that order is preserved,
  // never re-sorted and never mutated.
  const isTrades = trades.filter((trade) => classifyTradePartition(trade.entryDate) === "is");
  const oosTrades = trades.filter((trade) => classifyTradePartition(trade.entryDate) === "oos");
  return Object.freeze({
    slippageBps,
    all: computePartition(trades),
    is: computePartition(isTrades),
    oos: computePartition(oosTrades),
  });
}

/**
 * Transforms a complete M1-D sensitivity result into exact research metrics.
 * Reads M1-C economics only; computes nothing about fills, costs, or prices.
 */
export function analyzeResearch(input: SensitivityResult): ResearchResult {
  if (input.status === "invalid") {
    return {
      status: "invalid",
      errors: input.errors.map((issue) => ({
        field: `sensitivity.${issue.field}`,
        reason: issue.reason,
      })),
    };
  }
  const [zero, five, ten] = input.legs;
  if (zero?.slippageBps !== 0 || five?.slippageBps !== 5 || ten?.slippageBps !== 10) {
    return {
      status: "invalid",
      errors: [
        { field: "legs", reason: "Sensitivity legs must be exactly 0, 5, 10 bps in order." },
      ],
    };
  }
  for (const leg of [zero, five, ten]) {
    if (leg.result.status === "invalid") {
      return {
        status: "invalid",
        errors: leg.result.errors.map((issue) => ({
          field: `leg[${leg.slippageBps}].${issue.field}`,
          reason: issue.reason,
        })),
      };
    }
  }
  if (zero.result.status !== "ok" || five.result.status !== "ok" || ten.result.status !== "ok") {
    return {
      status: "invalid",
      errors: [{ field: "legs", reason: "All legs must be ok results." }],
    };
  }

  const legs = Object.freeze([
    toLegMetrics(0, zero.result.trades),
    toLegMetrics(5, five.result.trades),
    toLegMetrics(10, ten.result.trades),
  ]) as readonly [LegMetrics, LegMetrics, LegMetrics];

  return Object.freeze({
    status: "ok",
    splitId: RESEARCH_SPLIT_ID,
    splitDate: RESEARCH_SPLIT_DATE,
    referenceBps: SENSITIVITY_REFERENCE_BPS,
    legs,
    referenceOos: legs[1]?.oos as PartitionMetrics,
  }) as ResearchResult;
}
