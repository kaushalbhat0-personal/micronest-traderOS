import type { Paise } from "@/types/domain";

/**
 * TradePlan domain — the single source of truth for the TP-001 plan check.
 *
 * Pure TypeScript: no React, no browser APIs, no clock, no network. All money
 * is integer paise. The engine never throws for ordinary user-decision
 * outcomes; it returns an incoherent result with a factual reason.
 *
 * Deliberately local: the rupee parser below mirrors RiskGuard's parser
 * instead of importing it, because `features/` must not import `features/`
 * and no shared `lib/` abstraction has earned a second consumer yet.
 */

export const TRADE_PLAN_FORMULA_ID = "TP-001" as const;

/** Stated explicitly so the receipt can show it. Integer subtraction needs no rounding. */
export const TRADE_PLAN_ROUNDING_NOTE =
  "No rounding — exact integer-paise subtraction; R:R shown to two decimals" as const;

export type TradePlanDirection = "long" | "short";

export interface TradePlanInput {
  direction: TradePlanDirection;
  entryPaise: Paise;
  stopPaise: Paise;
  /** Absent when the user gives no target; R:R is then absent, not fabricated. */
  targetPaise?: Paise;
  /** Short label for the setup, e.g. "Breakout retest". */
  setupName: string;
  /** Why the user takes this trade, in their own words. */
  thesis: string;
  /** The condition under which the plan is wrong. */
  invalidation: string;
  /** Free-form extra context. Absent when blank. */
  notes?: string;
}

export type TradePlanInvalidCode = "invalid_input" | "invalid_stop" | "invalid_target";

export interface TradePlanCoherent {
  status: "coherent";
  formulaId: typeof TRADE_PLAN_FORMULA_ID;
  inputs: TradePlanInput;
  riskPerUnitPaise: Paise;
  rewardPerUnitPaise: Paise | null;
  /** reward / risk as a plain ratio (2 means 2:1). Display only; null without target. */
  riskRewardRatio: number | null;
  rounding: typeof TRADE_PLAN_ROUNDING_NOTE;
}

export interface TradePlanIncoherent {
  status: "incoherent";
  formulaId: typeof TRADE_PLAN_FORMULA_ID;
  code: TradePlanInvalidCode;
  /** Plain factual reason: states which rule the plan breaks. Never advisory. */
  reason: string;
  inputs: TradePlanInput;
  /** Null when the stop itself is invalid, so no per-unit risk exists. */
  riskPerUnitPaise: Paise | null;
  rounding: typeof TRADE_PLAN_ROUNDING_NOTE;
}

export type TradePlanResult = TradePlanCoherent | TradePlanIncoherent;

/**
 * Parses a user-typed rupee amount into integer paise using string splitting,
 * never binary floating-point. Accepts Indian digit grouping ("1,00,000").
 * Returns null for anything that is not a plain decimal with up to 2 places.
 */
export function parseRupeesToPaise(raw: string): Paise | null {
  const cleaned = raw.trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const rupees = Number(match[1]);
  const paiseFrac = (match[2] ?? "").padEnd(2, "0");
  const paise = rupees * 100 + Number(paiseFrac);
  return Number.isSafeInteger(paise) ? paise : null;
}

function isPositiveSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isNonEmptyText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function incoherent(
  code: TradePlanInvalidCode,
  reason: string,
  inputs: TradePlanInput,
  riskPerUnitPaise: Paise | null,
): TradePlanIncoherent {
  return {
    status: "incoherent",
    formulaId: TRADE_PLAN_FORMULA_ID,
    code,
    reason,
    inputs,
    riskPerUnitPaise,
    rounding: TRADE_PLAN_ROUNDING_NOTE,
  };
}

/**
 * TP-001: check whether the entered plan is internally coherent and expose
 * its risk/reward arithmetic. Direction is never silently corrected: a stop
 * or target on the wrong side is an incoherent outcome, not an absolute
 * value.
 */
export function checkPlan(input: TradePlanInput): TradePlanResult {
  const { direction, entryPaise, stopPaise, targetPaise, setupName, thesis, invalidation, notes } =
    input;

  if (
    (direction !== "long" && direction !== "short") ||
    !isPositiveSafeInt(entryPaise) ||
    !isPositiveSafeInt(stopPaise) ||
    (targetPaise !== undefined && !isPositiveSafeInt(targetPaise)) ||
    !isNonEmptyText(setupName) ||
    !isNonEmptyText(thesis) ||
    !isNonEmptyText(invalidation) ||
    (notes !== undefined && typeof notes !== "string")
  ) {
    return incoherent(
      "invalid_input",
      "One or more values are outside the valid range. Direction, entry, stop, setup, thesis and invalidation are required.",
      input,
      null,
    );
  }

  const riskPerUnitPaise = direction === "long" ? entryPaise - stopPaise : stopPaise - entryPaise;
  if (riskPerUnitPaise <= 0) {
    return incoherent(
      "invalid_stop",
      direction === "long"
        ? "Stop-loss is not below the entry price. For a long plan the stop must be below entry — the plan does not say where it is wrong."
        : "Stop-loss is not above the entry price. For a short plan the stop must be above entry — the plan does not say where it is wrong.",
      input,
      null,
    );
  }

  if (targetPaise === undefined) {
    return {
      status: "coherent",
      formulaId: TRADE_PLAN_FORMULA_ID,
      inputs: input,
      riskPerUnitPaise,
      rewardPerUnitPaise: null,
      riskRewardRatio: null,
      rounding: TRADE_PLAN_ROUNDING_NOTE,
    };
  }

  const rewardPerUnitPaise =
    direction === "long" ? targetPaise - entryPaise : entryPaise - targetPaise;
  if (rewardPerUnitPaise <= 0) {
    return incoherent(
      "invalid_target",
      direction === "long"
        ? "Target is not above the entry price. For a long plan the target must be above entry, or leave it blank."
        : "Target is not below the entry price. For a short plan the target must be below entry, or leave it blank.",
      input,
      riskPerUnitPaise,
    );
  }

  return {
    status: "coherent",
    formulaId: TRADE_PLAN_FORMULA_ID,
    inputs: input,
    riskPerUnitPaise,
    rewardPerUnitPaise,
    riskRewardRatio: rewardPerUnitPaise / riskPerUnitPaise,
    rounding: TRADE_PLAN_ROUNDING_NOTE,
  };
}
