import type { Paise } from "@/types/domain";

/**
 * StrikeLens domain — the single source of truth for the SL-001 comparison.
 *
 * Compares user-entered option strikes side-by-side on moneyness, intrinsic
 * and extrinsic value, distance from spot, and long option breakeven before
 * transaction costs. Model-free arithmetic on user inputs: no pricing model,
 * no Greeks, no implied volatility, no dates, no market data.
 *
 * Pure TypeScript: no React, no browser APIs, no clock, no network. All money
 * is integer paise. The engine never throws for ordinary user-decision
 * outcomes; it returns an invalid or inconsistent result with a factual
 * reason.
 *
 * Deliberately local: the rupee parser below mirrors the other tools'
 * parser instead of importing it, because `features/` must not import
 * `features/` and no shared `lib/` abstraction has earned a second consumer
 * yet.
 */

export const STRIKE_LENS_FORMULA_ID = "SL-001" as const;

/** Stated explicitly so the receipt can show it. */
export const STRIKE_LENS_ROUNDING_NOTE =
  "No rounding — exact integer-paise arithmetic; percentage shown to two decimals from integer basis points" as const;

/** ₹100 crore in paise — the product-wide money cap, shared with RiskGuard and TradeCost. */
export const STRIKE_LENS_MAX_PAISE = 100_000_000_000;

/** Comparison set bounds: at least one strike, at most five. */
export const STRIKE_LENS_MIN_ROWS = 1;
export const STRIKE_LENS_MAX_ROWS = 5;

/** Display mapping lives in the UI; the domain uses call/put throughout. */
export type StrikeLensOptionType = "call" | "put";

export type StrikeLensMoneyness = "ITM" | "ATM" | "OTM";

export interface StrikeLensRowInput {
  strikePaise: Paise;
  premiumPaise: Paise;
}

export interface StrikeLensInput {
  spotPaise: Paise;
  optionType: StrikeLensOptionType;
  rows: StrikeLensRowInput[];
  /** Display/provenance only. Never enters a calculation. */
  expiryLabel?: string;
}

export interface StrikeLensRowOk {
  status: "ok";
  strikePaise: Paise;
  premiumPaise: Paise;
  moneyness: StrikeLensMoneyness;
  intrinsicPaise: Paise;
  extrinsicPaise: Paise;
  /** Signed distance: strike − spot. Negative means the strike is below spot. */
  distancePaise: Paise;
  absDistancePaise: Paise;
  /** Integer basis points, half-up: round(|distance| × 10_000 / spot). Display only. */
  distanceBps: number;
  /** Long expiry breakeven before transaction costs: strike + premium (call). */
  breakevenPaise: Paise;
  /** True when breakevenPaise <= 0 (only reachable on deep-ITM puts). Display note, never a block. */
  breakevenAtOrBelowZero: boolean;
  /** True for the row with minimum |distance|; ties resolve to the lower strike. */
  isNearestToSpot: boolean;
}

export interface StrikeLensRowInconsistent {
  status: "inconsistent";
  strikePaise: Paise;
  premiumPaise: Paise;
  moneyness: StrikeLensMoneyness;
  intrinsicPaise: Paise;
  /** Absent by construction: a negative extrinsic value is never produced. */
  extrinsicPaise: null;
  distancePaise: Paise;
  absDistancePaise: Paise;
  distanceBps: number;
  breakevenPaise: Paise;
  breakevenAtOrBelowZero: boolean;
  isNearestToSpot: boolean;
  /** Plain factual reason: states the inconsistency. Never advisory. */
  reason: string;
}

export type StrikeLensRowResult = StrikeLensRowOk | StrikeLensRowInconsistent;

export interface StrikeLensCompared {
  status: "compared";
  formulaId: typeof STRIKE_LENS_FORMULA_ID;
  inputs: StrikeLensInput;
  /** Rows in ascending strike order. */
  rows: StrikeLensRowResult[];
  rounding: typeof STRIKE_LENS_ROUNDING_NOTE;
}

export type StrikeLensInvalidCode = "invalid_input";

export interface StrikeLensInvalid {
  status: "invalid";
  formulaId: typeof STRIKE_LENS_FORMULA_ID;
  code: StrikeLensInvalidCode;
  reason: string;
  inputs: StrikeLensInput;
  rounding: typeof STRIKE_LENS_ROUNDING_NOTE;
}

export type StrikeLensResult = StrikeLensCompared | StrikeLensInvalid;

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

/**
 * Integer basis points for |distance| / spot, half-up.
 * |distance| ≤ ₹100 crore (1e11 paise) and spot ≥ 1, so |distance| × 10_000
 * stays within the exact integer-safe range; the quotient/remainder split
 * keeps every intermediate exactly representable regardless.
 */
export function distanceBpsFor(absDistancePaise: Paise, spotPaise: Paise): number {
  const quotient = Math.floor(absDistancePaise / spotPaise);
  const remainder = absDistancePaise % spotPaise;
  const scaled = remainder * 10_000;
  const frac = Math.floor(scaled / spotPaise);
  const fracRem = scaled % spotPaise;
  return quotient * 10_000 + frac + (2 * fracRem >= spotPaise ? 1 : 0);
}

function moneynessFor(
  optionType: StrikeLensOptionType,
  spotPaise: Paise,
  strikePaise: Paise,
): StrikeLensMoneyness {
  if (strikePaise === spotPaise) return "ATM";
  if (optionType === "call") return spotPaise > strikePaise ? "ITM" : "OTM";
  return strikePaise > spotPaise ? "ITM" : "OTM";
}

const INCONSISTENT_REASON =
  "Premium is below intrinsic value. Check the premium or strike — extrinsic value cannot be negative.";

/**
 * SL-001: compare one option type's strikes against the spot price.
 * Integer paise throughout; the percentage distance is the only derived
 * ratio and stays in integer basis points until display.
 *
 * Rows are returned in ascending strike order. The nearest-to-spot flag
 * marks the row with minimum |distance|; ties resolve to the lower strike
 * (deterministic because the rows are strike-ordered before selection).
 */
export function compareStrikes(input: StrikeLensInput): StrikeLensResult {
  const { spotPaise, optionType, rows } = input;

  const invalid = (reason: string): StrikeLensInvalid => ({
    status: "invalid",
    formulaId: STRIKE_LENS_FORMULA_ID,
    code: "invalid_input",
    reason,
    inputs: input,
    rounding: STRIKE_LENS_ROUNDING_NOTE,
  });

  if (
    !isPositiveSafeInt(spotPaise) ||
    spotPaise > STRIKE_LENS_MAX_PAISE ||
    (optionType !== "call" && optionType !== "put") ||
    !Array.isArray(rows) ||
    rows.length < STRIKE_LENS_MIN_ROWS ||
    rows.length > STRIKE_LENS_MAX_ROWS
  ) {
    return invalid(
      "One or more values are outside the valid range. Spot, option type and 1–5 strike rows are required.",
    );
  }

  const seen = new Set<number>();
  for (const row of rows) {
    if (
      !isPositiveSafeInt(row.strikePaise) ||
      row.strikePaise > STRIKE_LENS_MAX_PAISE ||
      !isPositiveSafeInt(row.premiumPaise) ||
      row.premiumPaise > STRIKE_LENS_MAX_PAISE
    ) {
      return invalid(
        "One or more values are outside the valid range. Every strike and premium must be greater than zero and within ₹100 crore.",
      );
    }
    if (seen.has(row.strikePaise)) {
      return invalid("Each strike must be unique. Remove or correct the duplicated strike.");
    }
    seen.add(row.strikePaise);
  }

  const ordered = [...rows].sort((a, b) => a.strikePaise - b.strikePaise);

  let nearestPosition = -1;
  let nearestDistance = Number.POSITIVE_INFINITY;
  ordered.forEach((row, index) => {
    const distance = Math.abs(row.strikePaise - spotPaise);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestPosition = index;
    }
  });

  const compared: StrikeLensRowResult[] = ordered.map((row, index) => {
    const moneyness = moneynessFor(optionType, spotPaise, row.strikePaise);
    const intrinsicPaise =
      optionType === "call"
        ? Math.max(spotPaise - row.strikePaise, 0)
        : Math.max(row.strikePaise - spotPaise, 0);
    const distancePaise = row.strikePaise - spotPaise;
    const absDistancePaise = Math.abs(distancePaise);
    const distanceBps = distanceBpsFor(absDistancePaise, spotPaise);
    const breakevenPaise =
      optionType === "call"
        ? row.strikePaise + row.premiumPaise
        : row.strikePaise - row.premiumPaise;
    const breakevenAtOrBelowZero = breakevenPaise <= 0;
    const isNearestToSpot = index === nearestPosition;

    if (row.premiumPaise < intrinsicPaise) {
      return {
        status: "inconsistent",
        strikePaise: row.strikePaise,
        premiumPaise: row.premiumPaise,
        moneyness,
        intrinsicPaise,
        extrinsicPaise: null,
        distancePaise,
        absDistancePaise,
        distanceBps,
        breakevenPaise,
        breakevenAtOrBelowZero,
        isNearestToSpot,
        reason: INCONSISTENT_REASON,
      } satisfies StrikeLensRowInconsistent;
    }

    return {
      status: "ok",
      strikePaise: row.strikePaise,
      premiumPaise: row.premiumPaise,
      moneyness,
      intrinsicPaise,
      extrinsicPaise: row.premiumPaise - intrinsicPaise,
      distancePaise,
      absDistancePaise,
      distanceBps,
      breakevenPaise,
      breakevenAtOrBelowZero,
      isNearestToSpot,
    } satisfies StrikeLensRowOk;
  });

  return {
    status: "compared",
    formulaId: STRIKE_LENS_FORMULA_ID,
    inputs: input,
    rows: compared,
    rounding: STRIKE_LENS_ROUNDING_NOTE,
  };
}
