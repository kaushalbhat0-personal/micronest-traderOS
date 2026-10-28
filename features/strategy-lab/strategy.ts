import type { Paise } from "@/types/domain";

import type { Bar, StrategyParams } from "@/features/strategy-lab/types";

/**
 * Strategy boundary contracts (M1-B) — the seam between historical bars and
 * the one reference strategy.
 *
 * The strategy is a pure function of its context: the visible bar window, the
 * current position, and frozen parameters. It receives no dataset handle, no
 * index, no clock, no I/O — future-bar access is structurally impossible
 * because the engine (M1-C) only ever passes `bars[0..t]`. Decisions never
 * throw for data outcomes; insufficient history yields `no-signal`.
 */

/** Maximum signal note length. Notes are factual trace labels, not advice. */
export const STRATEGY_SIGNAL_NOTE_MAX_LENGTH = 140;

/** Minimal position view: enough to distinguish FLAT from LONG, nothing more. */
export type PositionState =
  | { status: "flat" }
  | {
      status: "long";
      entryPricePaise: Paise;
      quantity: number;
      stopPaise: Paise;
      targetPaise: Paise | null;
    };

/** Everything a strategy may observe at decision time. Nothing else exists. */
export interface StrategyContext {
  /** Bars `0..t` only — the visible window. The full dataset is unreachable. */
  bars: readonly Bar[];
  position: PositionState;
  params: StrategyParams;
}

/**
 * Locked M1 decision union. Entries carry the proposed stop (target is null
 * for SLAB-STRAT-001); exits carry only an audit note. No entry price (fills
 * are next-bar-open by execution rule), no quantity (run-config constant),
 * no expiry, no broker fields.
 */
export type StrategyDecision =
  | { kind: "no-signal" }
  | {
      kind: "entry";
      direction: "long";
      stopPaise: Paise;
      targetPaise: Paise | null;
      note: string;
    }
  | { kind: "exit"; note: string };

/** Strategy function shape: pure, deterministic, side-effect free. */
export type StrategyEvaluate = (context: StrategyContext) => StrategyDecision;
