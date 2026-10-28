import type { Paise } from "@/types/domain";

import {
  STRATEGY_SIGNAL_NOTE_MAX_LENGTH,
  type StrategyContext,
  type StrategyDecision,
} from "@/features/strategy-lab/strategy";

/**
 * SLAB-STRAT-001 — SMA cross with N-bar-low stop (M1-B).
 *
 * The only M1 strategy. Independently derived from the public textbook
 * definition of a simple moving average crossover: enter long when the fast
 * average strictly crosses above the slow average at the bar close; exit when
 * it strictly crosses below. The proposed stop is the lowest low of the last
 * `stopLookback` bars including the signal bar. No employer, proprietary, or
 * Brahmos content of any kind.
 *
 * Pure function of context: no clock, no I/O, no randomness. SMA comparisons
 * use exact integer cross-products over BigInt sums, so no floating-point
 * value ever participates in a decision.
 */

export const SMA_CROSS_STRATEGY_ID = "SLAB-STRAT-001" as const;
export const SMA_CROSS_STRATEGY_VERSION = "1.0.0" as const;

/** -1 = fast below slow, 0 = exactly equal, 1 = fast above slow. */
type SmaRelation = -1 | 0 | 1;

function windowCloseSum(
  bars: readonly { closePaise: Paise }[],
  end: number,
  period: number,
): bigint | null {
  const start = end - period + 1;
  if (start < 0 || end >= bars.length) {
    return null;
  }
  let sum = 0n;
  for (let i = start; i <= end; i += 1) {
    sum += BigInt((bars[i] as { closePaise: Paise }).closePaise);
  }
  return sum;
}

/**
 * Compares SMA(fast) vs SMA(slow) over windows ending at `end` without
 * dividing: fastAvg > slowAvg ⟺ fastSum × slow > slowSum × fast.
 * Null when history is insufficient — never a fabricated comparison.
 */
function compareSma(
  bars: readonly { closePaise: Paise }[],
  end: number,
  fastPeriod: number,
  slowPeriod: number,
): SmaRelation | null {
  const fastSum = windowCloseSum(bars, end, fastPeriod);
  const slowSum = windowCloseSum(bars, end, slowPeriod);
  if (fastSum === null || slowSum === null) {
    return null;
  }
  const left = fastSum * BigInt(slowPeriod);
  const right = slowSum * BigInt(fastPeriod);
  if (left > right) {
    return 1;
  }
  if (left < right) {
    return -1;
  }
  return 0;
}

function lowestLow(
  bars: readonly { date: string; lowPaise: Paise }[],
  end: number,
  lookback: number,
): Paise | null {
  const start = end - lookback + 1;
  if (start < 0 || end >= bars.length) {
    return null;
  }
  let low = (bars[end] as { lowPaise: Paise }).lowPaise;
  for (let i = start; i < end; i += 1) {
    const candidate = (bars[i] as { lowPaise: Paise }).lowPaise;
    if (candidate < low) {
      low = candidate;
    }
  }
  return low;
}

function fitNote(note: string): string {
  return note.length <= STRATEGY_SIGNAL_NOTE_MAX_LENGTH
    ? note
    : note.slice(0, STRATEGY_SIGNAL_NOTE_MAX_LENGTH);
}

function paramsSane(context: StrategyContext): boolean {
  const { fastPeriod, slowPeriod, stopLookback, minBars } = context.params;
  return (
    Number.isSafeInteger(fastPeriod) &&
    Number.isSafeInteger(slowPeriod) &&
    Number.isSafeInteger(stopLookback) &&
    Number.isSafeInteger(minBars) &&
    fastPeriod >= 1 &&
    fastPeriod < slowPeriod &&
    stopLookback >= 1 &&
    minBars >= slowPeriod
  );
}

/**
 * Evaluates SLAB-STRAT-001 at the close of the last supplied bar.
 * The strategy proposes; it never validates protectiveness against a fill
 * (M1-C owns the stop-vs-fill rule) and never sizes, executes, or costs.
 */
export function evaluateSmaCross(context: StrategyContext): StrategyDecision {
  const noSignal: StrategyDecision = { kind: "no-signal" };
  const { bars, position, params } = context;

  if (!paramsSane(context)) {
    return noSignal;
  }
  if (bars.length < params.minBars) {
    return noSignal;
  }

  const t = bars.length - 1;
  const current = compareSma(bars, t, params.fastPeriod, params.slowPeriod);
  const previous = compareSma(bars, t - 1, params.fastPeriod, params.slowPeriod);
  if (current === null || previous === null) {
    return noSignal;
  }

  if (position.status === "flat") {
    if (previous <= 0 && current === 1) {
      const stop = lowestLow(bars, t, params.stopLookback);
      if (stop === null) {
        return noSignal;
      }
      const date = (bars[t] as { date: string }).date;
      return {
        kind: "entry",
        direction: "long",
        stopPaise: stop,
        targetPaise: null,
        note: fitNote(
          `${SMA_CROSS_STRATEGY_ID} entry: SMA(${params.fastPeriod}) crossed above SMA(${params.slowPeriod}) at ${date}; proposed stop ${stop} paise (${params.stopLookback}-bar low).`,
        ),
      };
    }
    return noSignal;
  }

  if (previous >= 0 && current === -1) {
    const date = (bars[t] as { date: string }).date;
    return {
      kind: "exit",
      note: fitNote(
        `${SMA_CROSS_STRATEGY_ID} exit: SMA(${params.fastPeriod}) crossed below SMA(${params.slowPeriod}) at ${date}.`,
      ),
    };
  }
  return noSignal;
}
