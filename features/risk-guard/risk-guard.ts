import type { BasisPoints, Paise } from "@/types/domain";

/**
 * RiskGuard domain — the single source of truth for the RG-001 calculation.
 *
 * Pure TypeScript: no React, no browser APIs, no clock, no network. All money
 * is integer paise, all rates are integer basis points. The engine never
 * throws for ordinary user-decision outcomes; it returns a blocked result.
 */

export const RISK_GUARD_FORMULA_ID = "RG-001" as const;

/** Where rounding happens. Stated explicitly so the receipt can show it. */
export const RISK_GUARD_ROUNDING_NOTE = "Floor to lot size" as const;

export type RiskGuardDirection = "long" | "short";

export interface RiskGuardInput {
  capitalPaise: Paise;
  riskBps: BasisPoints;
  direction: RiskGuardDirection;
  entryPaise: Paise;
  stopPaise: Paise;
  /** Whole units per lot. Always >= 1. */
  lotSize: number;
  /** Absent when the user gives no target; R:R is then absent, not fabricated. */
  targetPaise?: Paise;
}

export type RiskGuardBlockedCode =
  | "invalid_input"
  | "invalid_stop"
  | "too_small_for_one_lot"
  | "invalid_target";

export interface RiskGuardAllowed {
  status: "allowed";
  formulaId: typeof RISK_GUARD_FORMULA_ID;
  inputs: RiskGuardInput;
  riskBudgetPaise: Paise;
  riskPerUnitPaise: Paise;
  /** Largest quantity the budget allows before lot flooring. */
  maxQuantity: number;
  lots: number;
  /** Selected quantity: lots × lotSize. Never exceeds the risk budget. */
  quantity: number;
  usedRiskPaise: Paise;
  unusedRiskPaise: Paise;
  rewardPerUnitPaise: Paise | null;
  /** reward / risk as a plain ratio (2 means 2:1). Display only; null without target. */
  riskRewardRatio: number | null;
  rounding: typeof RISK_GUARD_ROUNDING_NOTE;
}

export interface RiskGuardBlocked {
  status: "blocked";
  formulaId: typeof RISK_GUARD_FORMULA_ID;
  code: RiskGuardBlockedCode;
  /** Plain professional reason: enforces the user's own constraint. Never alarming. */
  reason: string;
  inputs: RiskGuardInput;
  riskBudgetPaise: Paise;
  /** Null when the stop itself is invalid, so no per-unit risk exists. */
  riskPerUnitPaise: Paise | null;
  /** Cost of one lot at current per-unit risk. Null when per-unit risk is unknown. */
  requiredForOneLotPaise: Paise | null;
  /** Largest affordable quantity (0 when blocked). Shown so the user sees the maths. */
  maxQuantity: number;
  rounding: typeof RISK_GUARD_ROUNDING_NOTE;
}

export type RiskGuardResult = RiskGuardAllowed | RiskGuardBlocked;

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

/**
 * Parses a user-typed percentage (e.g. "2.5") into integer basis points
 * (250) using string splitting. Returns null for anything that is not a
 * plain decimal with up to 2 places.
 */
export function parsePercentToBps(raw: string): BasisPoints | null {
  const cleaned = raw.trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = Number(match[1]);
  const frac = (match[2] ?? "").padEnd(2, "0");
  const bps = whole * 100 + Number(frac);
  return Number.isSafeInteger(bps) ? bps : null;
}

/** Parses a lot size: digits only, integer >= 1. */
export function parseLotSize(raw: string): number | null {
  const cleaned = raw.trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/**
 * Floors a quantity down to whole lots. Never rounds up: rounding up could
 * exceed the user's stated risk budget. Returns 0 for invalid input rather
 * than throwing, so callers stay total.
 */
export function floorToLot(quantity: number, lotSize: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 0) return 0;
  if (!Number.isSafeInteger(lotSize) || lotSize <= 0) return 0;
  return Math.floor(quantity / lotSize);
}

function isPositiveSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function blocked(
  code: RiskGuardBlockedCode,
  reason: string,
  inputs: RiskGuardInput,
  riskBudgetPaise: Paise,
  riskPerUnitPaise: Paise | null,
  maxQuantity: number,
): RiskGuardBlocked {
  return {
    status: "blocked",
    formulaId: RISK_GUARD_FORMULA_ID,
    code,
    reason,
    inputs,
    riskBudgetPaise,
    riskPerUnitPaise,
    requiredForOneLotPaise:
      riskPerUnitPaise === null ? null : riskPerUnitPaise * inputs.lotSize,
    maxQuantity,
    rounding: RISK_GUARD_ROUNDING_NOTE,
  };
}

/**
 * RG-001: turn the user's risk constraint into an allowed quantity or a
 * transparent blocked outcome. Integer arithmetic throughout:
 * budget = floor(capital × bps / 10000); maxQty = floor(budget / perUnit).
 *
 * The budget uses a quotient/remainder decomposition so no intermediate
 * product ever exceeds the exact integer-safe range:
 * capital = q × 10000 + r → floor(capital × bps / 10000) = q × bps + floor(r × bps / 10000).
 * With capital ≤ ₹100 crore (100_000_000_000 paise) and bps ≤ 10_000,
 * q ≤ 10_000_000 (q × bps ≤ 10^11) and r < 10_000 (r × bps < 10^8),
 * so every intermediate value is exactly representable.
 */
function riskBudgetPaiseFor(capitalPaise: Paise, riskBps: BasisPoints): Paise {
  const quotient = Math.floor(capitalPaise / 10_000);
  const remainder = capitalPaise % 10_000;
  return quotient * riskBps + Math.floor((remainder * riskBps) / 10_000);
}

export function decidePosition(input: RiskGuardInput): RiskGuardResult {
  const { capitalPaise, riskBps, direction, entryPaise, stopPaise, lotSize, targetPaise } = input;

  if (
    !isPositiveSafeInt(capitalPaise) ||
    !isPositiveSafeInt(riskBps) ||
    !isPositiveSafeInt(entryPaise) ||
    !isPositiveSafeInt(stopPaise) ||
    !Number.isSafeInteger(lotSize) ||
    lotSize < 1 ||
    (direction !== "long" && direction !== "short") ||
    (targetPaise !== undefined && !isPositiveSafeInt(targetPaise))
  ) {
    return blocked(
      "invalid_input",
      "One or more values are outside the valid range. Capital, risk %, entry, stop and lot size must be positive.",
      input,
      0,
      null,
      0,
    );
  }

  const riskBudgetPaise = riskBudgetPaiseFor(capitalPaise, riskBps);
  if (riskBudgetPaise <= 0) {
    return blocked(
      "invalid_input",
      "The risk budget rounds down to zero. Use a larger capital or risk % so the budget is at least 1 paise.",
      input,
      0,
      null,
      0,
    );
  }

  const riskPerUnitPaise = direction === "long" ? entryPaise - stopPaise : stopPaise - entryPaise;
  if (riskPerUnitPaise <= 0) {
    return blocked(
      "invalid_stop",
      direction === "long"
        ? "Stop-loss is not below the entry price. For a long trade the stop must be below entry."
        : "Stop-loss is not above the entry price. For a short trade the stop must be above entry.",
      input,
      riskBudgetPaise,
      null,
      0,
    );
  }

  const maxQuantity = Math.floor(riskBudgetPaise / riskPerUnitPaise);
  const lots = floorToLot(maxQuantity, lotSize);
  if (lots < 1) {
    return blocked(
      "too_small_for_one_lot",
      "The risk budget cannot accommodate one full lot at this stop distance. Reduce the lot size or widen the budget.",
      input,
      riskBudgetPaise,
      riskPerUnitPaise,
      maxQuantity,
    );
  }

  const quantity = lots * lotSize;
  const usedRiskPaise = quantity * riskPerUnitPaise;

  if (targetPaise === undefined) {
    return {
      status: "allowed",
      formulaId: RISK_GUARD_FORMULA_ID,
      inputs: input,
      riskBudgetPaise,
      riskPerUnitPaise,
      maxQuantity,
      lots,
      quantity,
      usedRiskPaise,
      unusedRiskPaise: riskBudgetPaise - usedRiskPaise,
      rewardPerUnitPaise: null,
      riskRewardRatio: null,
      rounding: RISK_GUARD_ROUNDING_NOTE,
    };
  }

  const rewardPerUnitPaise = direction === "long" ? targetPaise - entryPaise : entryPaise - targetPaise;
  if (rewardPerUnitPaise <= 0) {
    return blocked(
      "invalid_target",
      direction === "long"
        ? "Target is not above the entry price. For a long trade the target must be above entry, or leave it blank."
        : "Target is not below the entry price. For a short trade the target must be below entry, or leave it blank.",
      input,
      riskBudgetPaise,
      riskPerUnitPaise,
      maxQuantity,
    );
  }

  return {
    status: "allowed",
    formulaId: RISK_GUARD_FORMULA_ID,
    inputs: input,
    riskBudgetPaise,
    riskPerUnitPaise,
    maxQuantity,
    lots,
    quantity,
    usedRiskPaise,
    unusedRiskPaise: riskBudgetPaise - usedRiskPaise,
    rewardPerUnitPaise,
    riskRewardRatio: rewardPerUnitPaise / riskPerUnitPaise,
    rounding: RISK_GUARD_ROUNDING_NOTE,
  };
}
