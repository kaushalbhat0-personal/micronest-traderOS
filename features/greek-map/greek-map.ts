import type { Paise } from "@/types/domain";

/**
 * GreekMap domain — the single source of truth for the GM-001 model
 * sensitivity illustration.
 *
 * One European option (call or put) is priced with Black-Scholes-Merton under
 * a continuous dividend yield, from the user's own inputs. The engine then
 * replays the same closed form across fixed spot scenarios (-10% to +10%)
 * and fixed time scenarios (-1/-3/-7 days). Nothing is fetched, nothing is
 * inferred, nothing is ranked: every number on screen comes from this module.
 *
 * Pure TypeScript: no React, no browser APIs, no clock, no network. Money
 * enters as integer paise; the continuous BSM core runs in IEEE floating
 * point (exp, ln and sqrt have no integer-only form) and the model value is
 * rounded half-up to paise at the display edge. Greeks are returned as plain
 * decimals and formatted at fixed precision by the UI.
 *
 * Deliberately local: the rupee parser below mirrors the other tools'
 * parser instead of importing it, because `features/` must not import
 * `features/` and no shared `lib/` abstraction has earned a second consumer
 * yet.
 */

export const GREEK_MAP_FORMULA_ID = "GM-001" as const;

/** Stated explicitly so the receipt can show it. */
export const GREEK_MAP_ROUNDING_NOTE =
  "Model value rounded half-up to paise for display; Delta 4dp, Gamma 6dp, Theta/Vega/Rho 2dp" as const;

/** ₹100 crore in paise — the product-wide money cap, shared with the other tools. */
export const GREEK_MAP_MAX_PAISE = 100_000_000_000;

/** DTE boundary: calendar days, 1–730, up to 2 decimals. Validation decides on the exact string. */
export const GREEK_MAP_MIN_DTE_DAYS = 1;
export const GREEK_MAP_MAX_DTE_DAYS = 730;
export const GREEK_MAP_DTE_DECIMALS = 2;

/** Continuous-input boundaries, as decimals of the annual quantity. */
export const GREEK_MAP_MIN_VOLATILITY_DECIMAL = 0.001; // 0.1%
export const GREEK_MAP_MAX_VOLATILITY_DECIMAL = 5; // 500%
export const GREEK_MAP_MIN_RATE_DECIMAL = 0; // 0%
export const GREEK_MAP_MAX_RATE_DECIMAL = 0.2; // 20%
export const GREEK_MAP_MIN_DIVIDEND_DECIMAL = 0; // 0%
export const GREEK_MAP_MAX_DIVIDEND_DECIMAL = 0.15; // 15%
/** Percent fields accept up to 4 decimals; the boundary is decided exactly (see validation). */
export const GREEK_MAP_PERCENT_DECIMALS = 4;

/** Calendar-day convention: T = DTE / 365. No other time convention exists here. */
export const GREEK_MAP_DAYS_PER_YEAR = 365;

/** Fixed spot scenarios, applied to S with K, DTE, σ, r, q held constant. */
export const GREEK_MAP_SPOT_SCENARIO_PCTS = [-10, -5, 0, 5, 10] as const;

/** Fixed time scenarios, as days subtracted from DTE. */
export const GREEK_MAP_TIME_SCENARIO_DAYS = [1, 3, 7] as const;

/**
 * Error bound of the Abramowitz–Stegun 7.1.26 erf approximation used for the
 * normal CDF below. Documented so tests can assert it.
 */
export const GREEK_MAP_NORMAL_CDF_ERROR_BOUND = 1.5e-7;

/** Half a paise in rupees: the display tolerance for the arbitrage-bound check. */
const HALF_PAISE_RUPEES = 0.005;

export type GreekMapOptionType = "call" | "put";

export interface GreekMapInput {
  optionType: GreekMapOptionType;
  spotPaise: Paise;
  strikePaise: Paise;
  /** Calendar days to expiry, 1–730. T = dteDays / 365. */
  dteDays: number;
  /** Annual volatility as a decimal: 20% → 0.2. */
  volatilityDecimal: number;
  /** Annual continuous risk-free rate as a decimal. */
  rateDecimal: number;
  /** Annual continuous dividend yield as a decimal. */
  dividendDecimal: number;
  /** Optional user premium, integer paise. Used only for arithmetic comparison. */
  premiumPaise?: Paise;
  /** Display/provenance only. Never enters a calculation. */
  expiryLabel?: string;
}

/** One evaluated model point: price plus the five Greeks in display units. */
export interface GreekMapModelPoint {
  /** Full-precision rupees. The UI rounds half-up to paise for display. */
  priceRupees: number;
  /** Per ₹1 underlying move. Call: e^-qT·N(d1). Put: e^-qT·(N(d1)−1). */
  delta: number;
  /** Per ₹1 underlying move. Same for call and put. */
  gamma: number;
  /** −∂V/∂T, converted to ₹ per calendar day (÷ 365). */
  thetaPerDay: number;
  /** Per 1 percentage-point IV change (standard Vega ÷ 100). */
  vegaPer1pp: number;
  /** Per 1 percentage-point rate change (standard Rho ÷ 100). */
  rhoPer1pp: number;
}

export interface GreekMapSpotScenarioRow extends GreekMapModelPoint {
  scenarioPct: number;
  /** Scenario spot, rounded half-up to paise for display; the maths uses full precision. */
  spotPaise: Paise;
  pricePaise: Paise;
  /** True for the 0% row, which repeats the base inputs. */
  isBase: boolean;
}

export interface GreekMapTimeScenarioRow extends GreekMapModelPoint {
  /** Days subtracted from the entered DTE. */
  minusDays: number;
  dteDays: number;
  pricePaise: Paise;
  omitted: false;
}

export interface GreekMapTimeScenarioOmitted {
  minusDays: number;
  dteDays: number;
  omitted: true;
}

export type GreekMapTimeScenario = GreekMapTimeScenarioRow | GreekMapTimeScenarioOmitted;

export interface GreekMapComparison {
  yourPremiumPaise: Paise;
  modelValuePaise: Paise;
  /** Exact integer difference: your premium − model value. Arithmetic only. */
  differencePaise: Paise;
}

export type GreekMapWarningCode = "premium_under_intrinsic" | "outside_arbitrage_bounds";

export interface GreekMapWarning {
  code: GreekMapWarningCode;
  message: string;
}

export interface GreekMapAnalysed {
  status: "ok";
  formulaId: typeof GREEK_MAP_FORMULA_ID;
  inputs: GreekMapInput;
  /** Base model point plus its display-rounded price. */
  base: GreekMapModelPoint & { pricePaise: Paise };
  /** Intrinsic value in paise: max(spot − strike, 0) for calls, max(strike − spot, 0) for puts. */
  intrinsicPaise: Paise;
  /** Five fixed rows in scenario order; the 0% row repeats the base point. */
  spotScenarios: GreekMapSpotScenarioRow[];
  /** −1/−3/−7 day rows, or an omission marker when the DTE floor is reached. */
  timeScenarios: GreekMapTimeScenario[];
  /** Present only when the user typed a premium. Arithmetic only, never a verdict. */
  comparison: GreekMapComparison | null;
  warnings: GreekMapWarning[];
  rounding: typeof GREEK_MAP_ROUNDING_NOTE;
}

export type GreekMapInvalidCode = "invalid_input";

export interface GreekMapInvalid {
  status: "invalid";
  formulaId: typeof GREEK_MAP_FORMULA_ID;
  code: GreekMapInvalidCode;
  reason: string;
  inputs: GreekMapInput;
  rounding: typeof GREEK_MAP_ROUNDING_NOTE;
}

export type GreekMapResult = GreekMapAnalysed | GreekMapInvalid;

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

const SQRT_2PI = Math.sqrt(2 * Math.PI);

/** Standard normal density. Returns NaN for non-finite input. */
export function normalPdf(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  return Math.exp(-0.5 * x * x) / SQRT_2PI;
}

/**
 * Standard normal CDF via the Abramowitz–Stegun 7.1.26 erf approximation
 * (formula for erf, mapped through N(x) = Φ(x) = ½(1 + erf(x/√2))).
 * Approximation error bound ≤ 1.5e-7. Returns NaN for non-finite input.
 */
export function normalCdf(x: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (x === 0) return 0.5;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * ax);
  const erf =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-ax * ax);
  return 0.5 * (1 + sign * erf);
}

export interface GreekMapD1D2 {
  d1: number;
  d2: number;
}

/**
 * BSM-Merton d1/d2. S, K in rupees; T in calendar years; σ, r, q as annual
 * decimals. Returns null when the inputs cannot form a valid d1 (non-positive
 * S/K/T/σ or a non-finite intermediate).
 */
export function d1d2(
  spotRupees: number,
  strikeRupees: number,
  yearsToExpiry: number,
  volatilityDecimal: number,
  rateDecimal: number,
  dividendDecimal: number,
): GreekMapD1D2 | null {
  const values = [
    spotRupees,
    strikeRupees,
    yearsToExpiry,
    volatilityDecimal,
    rateDecimal,
    dividendDecimal,
  ];
  if (!values.every((value) => Number.isFinite(value))) return null;
  if (spotRupees <= 0 || strikeRupees <= 0 || yearsToExpiry <= 0 || volatilityDecimal <= 0) {
    return null;
  }
  const sigmaRootT = volatilityDecimal * Math.sqrt(yearsToExpiry);
  const d1 =
    (Math.log(spotRupees / strikeRupees) +
      (rateDecimal - dividendDecimal + 0.5 * volatilityDecimal * volatilityDecimal) *
        yearsToExpiry) /
    sigmaRootT;
  if (!Number.isFinite(d1)) return null;
  const d2 = d1 - sigmaRootT;
  if (!Number.isFinite(d2)) return null;
  return { d1, d2 };
}

/**
 * One BSM-Merton evaluation: European price plus the five Greeks in the
 * locked display units. Returns null when any intermediate or result is
 * non-finite, so the caller can report a numerical-invalid state instead of
 * leaking NaN or Infinity to the UI.
 */
export function modelPoint(
  optionType: GreekMapOptionType,
  spotRupees: number,
  strikeRupees: number,
  yearsToExpiry: number,
  volatilityDecimal: number,
  rateDecimal: number,
  dividendDecimal: number,
): GreekMapModelPoint | null {
  if (optionType !== "call" && optionType !== "put") return null;
  const dd = d1d2(
    spotRupees,
    strikeRupees,
    yearsToExpiry,
    volatilityDecimal,
    rateDecimal,
    dividendDecimal,
  );
  if (dd === null) return null;
  const { d1, d2 } = dd;
  const discountDividend = Math.exp(-dividendDecimal * yearsToExpiry);
  const discountRate = Math.exp(-rateDecimal * yearsToExpiry);
  const nd1 = normalCdf(d1);
  const nd2 = normalCdf(d2);
  const phi = normalPdf(d1);
  const sigmaRootT = volatilityDecimal * Math.sqrt(yearsToExpiry);

  let priceRupees: number;
  let delta: number;
  let thetaPerYear: number;
  let rho: number;
  if (optionType === "call") {
    priceRupees = spotRupees * discountDividend * nd1 - strikeRupees * discountRate * nd2;
    delta = discountDividend * nd1;
    thetaPerYear =
      (-spotRupees * discountDividend * phi * volatilityDecimal) / (2 * Math.sqrt(yearsToExpiry)) +
      dividendDecimal * spotRupees * discountDividend * nd1 -
      rateDecimal * strikeRupees * discountRate * nd2;
    rho = strikeRupees * yearsToExpiry * discountRate * nd2;
  } else {
    priceRupees =
      strikeRupees * discountRate * normalCdf(-d2) - spotRupees * discountDividend * normalCdf(-d1);
    delta = discountDividend * (nd1 - 1);
    thetaPerYear =
      (-spotRupees * discountDividend * phi * volatilityDecimal) / (2 * Math.sqrt(yearsToExpiry)) -
      dividendDecimal * spotRupees * discountDividend * normalCdf(-d1) +
      rateDecimal * strikeRupees * discountRate * normalCdf(-d2);
    rho = -strikeRupees * yearsToExpiry * discountRate * normalCdf(-d2);
  }

  const gamma = (discountDividend * phi) / (spotRupees * sigmaRootT);
  const vega = spotRupees * discountDividend * phi * Math.sqrt(yearsToExpiry);

  const point: GreekMapModelPoint = {
    priceRupees,
    delta,
    gamma,
    thetaPerDay: thetaPerYear / GREEK_MAP_DAYS_PER_YEAR,
    vegaPer1pp: vega / 100,
    rhoPer1pp: rho / 100,
  };
  if (!Object.values(point).every((value) => Number.isFinite(value))) return null;
  return point;
}

/**
 * Half-up rounding of a rupee value to integer paise for display. The model
 * value is never clamped: a non-finite input yields null so the caller can
 * report a numerical-invalid state. Normalises −0 to 0.
 */
export function roundHalfUpRupeesToPaise(valueRupees: number): Paise | null {
  if (!Number.isFinite(valueRupees)) return null;
  const rounded = Math.round(valueRupees * 100);
  if (!Number.isSafeInteger(rounded)) return null;
  return rounded === 0 ? 0 : rounded;
}

/** Exact integer-paise intrinsic value for the given inputs. */
export function intrinsicPaiseFor(
  optionType: GreekMapOptionType,
  spotPaise: Paise,
  strikePaise: Paise,
): Paise {
  return optionType === "call"
    ? Math.max(spotPaise - strikePaise, 0)
    : Math.max(strikePaise - spotPaise, 0);
}

export interface GreekMapArbitrageBounds {
  lowerRupees: number;
  upperRupees: number;
}

/**
 * European no-arbitrage bounds for the premium under the entered model:
 * call ∈ [max(S·e^−qT − K·e^−rT, 0), S·e^−qT],
 * put ∈ [max(K·e^−rT − S·e^−qT, 0), K·e^−rT].
 * Returns null when the bounds cannot be formed (non-finite inputs).
 */
export function arbitrageBoundsFor(
  optionType: GreekMapOptionType,
  spotRupees: number,
  strikeRupees: number,
  yearsToExpiry: number,
  rateDecimal: number,
  dividendDecimal: number,
): GreekMapArbitrageBounds | null {
  const values = [spotRupees, strikeRupees, yearsToExpiry, rateDecimal, dividendDecimal];
  if (!values.every((value) => Number.isFinite(value))) return null;
  if (optionType !== "call" && optionType !== "put") return null;
  const discountedSpot = spotRupees * Math.exp(-dividendDecimal * yearsToExpiry);
  const discountedStrike = strikeRupees * Math.exp(-rateDecimal * yearsToExpiry);
  if (!Number.isFinite(discountedSpot) || !Number.isFinite(discountedStrike)) return null;
  if (optionType === "call") {
    return {
      lowerRupees: Math.max(discountedSpot - discountedStrike, 0),
      upperRupees: discountedSpot,
    };
  }
  return {
    lowerRupees: Math.max(discountedStrike - discountedSpot, 0),
    upperRupees: discountedStrike,
  };
}

function isValidMoney(value: unknown): value is Paise {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= GREEK_MAP_MAX_PAISE
  );
}

/**
 * GM-001: price one European option from user inputs and replay the same
 * closed form across the fixed spot and time scenarios.
 *
 * Out-of-range inputs and non-finite intermediates return a blocked
 * `invalid_input` result with a factual reason — the UI never sees NaN.
 * A premium under intrinsic value, or outside the European arbitrage bounds,
 * is reported as an informational warning while the model still calculates.
 */
export function analyzeGreekMap(input: GreekMapInput): GreekMapResult {
  const invalid = (reason: string): GreekMapInvalid => ({
    status: "invalid",
    formulaId: GREEK_MAP_FORMULA_ID,
    code: "invalid_input",
    reason,
    inputs: input,
    rounding: GREEK_MAP_ROUNDING_NOTE,
  });

  const {
    optionType,
    spotPaise,
    strikePaise,
    dteDays,
    volatilityDecimal,
    rateDecimal,
    dividendDecimal,
    premiumPaise,
  } = input;

  if (optionType !== "call" && optionType !== "put") {
    return invalid("Option type must be call or put.");
  }
  if (!isValidMoney(spotPaise) || !isValidMoney(strikePaise)) {
    return invalid("Spot and strike must each be greater than zero and within ₹100 crore.");
  }
  if (
    !Number.isFinite(dteDays) ||
    dteDays < GREEK_MAP_MIN_DTE_DAYS ||
    dteDays > GREEK_MAP_MAX_DTE_DAYS
  ) {
    return invalid("Days to expiry must be between 1 and 730 calendar days.");
  }
  if (
    !Number.isFinite(volatilityDecimal) ||
    volatilityDecimal < GREEK_MAP_MIN_VOLATILITY_DECIMAL ||
    volatilityDecimal > GREEK_MAP_MAX_VOLATILITY_DECIMAL
  ) {
    return invalid("Volatility must be between 0.1% and 500% per year.");
  }
  if (
    !Number.isFinite(rateDecimal) ||
    rateDecimal < GREEK_MAP_MIN_RATE_DECIMAL ||
    rateDecimal > GREEK_MAP_MAX_RATE_DECIMAL
  ) {
    return invalid("Risk-free rate must be between 0% and 20% per year.");
  }
  if (
    !Number.isFinite(dividendDecimal) ||
    dividendDecimal < GREEK_MAP_MIN_DIVIDEND_DECIMAL ||
    dividendDecimal > GREEK_MAP_MAX_DIVIDEND_DECIMAL
  ) {
    return invalid("Dividend yield must be between 0% and 15% per year.");
  }
  if (premiumPaise !== undefined && !isValidMoney(premiumPaise)) {
    return invalid("Your premium, when given, must be greater than zero and within ₹100 crore.");
  }

  const spotRupees = spotPaise / 100;
  const strikeRupees = strikePaise / 100;
  const yearsToExpiry = dteDays / GREEK_MAP_DAYS_PER_YEAR;

  const basePoint = modelPoint(
    optionType,
    spotRupees,
    strikeRupees,
    yearsToExpiry,
    volatilityDecimal,
    rateDecimal,
    dividendDecimal,
  );
  if (basePoint === null) {
    return invalid(
      "The model could not form a finite result from these inputs. Check the values and try again.",
    );
  }
  const basePricePaise = roundHalfUpRupeesToPaise(basePoint.priceRupees);
  if (basePricePaise === null) {
    return invalid(
      "The model could not form a finite result from these inputs. Check the values and try again.",
    );
  }

  const intrinsicPaise = intrinsicPaiseFor(optionType, spotPaise, strikePaise);
  const warnings: GreekMapWarning[] = [];
  let comparison: GreekMapComparison | null = null;

  if (premiumPaise !== undefined) {
    if (premiumPaise < intrinsicPaise) {
      warnings.push({
        code: "premium_under_intrinsic",
        message:
          "Your premium is under the intrinsic value for the supplied inputs. The model still calculates from your inputs.",
      });
    }
    const bounds = arbitrageBoundsFor(
      optionType,
      spotRupees,
      strikeRupees,
      yearsToExpiry,
      rateDecimal,
      dividendDecimal,
    );
    if (bounds !== null) {
      const premiumRupees = premiumPaise / 100;
      if (
        premiumRupees < bounds.lowerRupees - HALF_PAISE_RUPEES ||
        premiumRupees > bounds.upperRupees + HALF_PAISE_RUPEES
      ) {
        warnings.push({
          code: "outside_arbitrage_bounds",
          message:
            "Premium is outside the European arbitrage bounds for the supplied inputs. No single IV reproduces this premium under BSM.",
        });
      }
    }
    comparison = {
      yourPremiumPaise: premiumPaise,
      modelValuePaise: basePricePaise,
      differencePaise: premiumPaise - basePricePaise,
    };
  }

  const spotScenarios: GreekMapSpotScenarioRow[] = [];
  for (const scenarioPct of GREEK_MAP_SPOT_SCENARIO_PCTS) {
    const scenarioSpotRupees = spotRupees * (1 + scenarioPct / 100);
    const point = modelPoint(
      optionType,
      scenarioSpotRupees,
      strikeRupees,
      yearsToExpiry,
      volatilityDecimal,
      rateDecimal,
      dividendDecimal,
    );
    if (point === null) {
      return invalid(
        "The model could not form a finite result from these inputs. Check the values and try again.",
      );
    }
    const pricePaise = roundHalfUpRupeesToPaise(point.priceRupees);
    const scenarioSpotPaise = roundHalfUpRupeesToPaise(scenarioSpotRupees);
    if (pricePaise === null || scenarioSpotPaise === null) {
      return invalid(
        "The model could not form a finite result from these inputs. Check the values and try again.",
      );
    }
    spotScenarios.push({
      ...point,
      scenarioPct,
      spotPaise: scenarioSpotPaise,
      pricePaise,
      isBase: scenarioPct === 0,
    });
  }

  const timeScenarios: GreekMapTimeScenario[] = [];
  for (const minusDays of GREEK_MAP_TIME_SCENARIO_DAYS) {
    const scenarioDte = dteDays - minusDays;
    if (scenarioDte < GREEK_MAP_MIN_DTE_DAYS) {
      timeScenarios.push({ minusDays, dteDays: scenarioDte, omitted: true });
      continue;
    }
    const point = modelPoint(
      optionType,
      spotRupees,
      strikeRupees,
      scenarioDte / GREEK_MAP_DAYS_PER_YEAR,
      volatilityDecimal,
      rateDecimal,
      dividendDecimal,
    );
    if (point === null) {
      return invalid(
        "The model could not form a finite result from these inputs. Check the values and try again.",
      );
    }
    const pricePaise = roundHalfUpRupeesToPaise(point.priceRupees);
    if (pricePaise === null) {
      return invalid(
        "The model could not form a finite result from these inputs. Check the values and try again.",
      );
    }
    timeScenarios.push({ ...point, minusDays, dteDays: scenarioDte, pricePaise, omitted: false });
  }

  return {
    status: "ok",
    formulaId: GREEK_MAP_FORMULA_ID,
    inputs: input,
    base: { ...basePoint, pricePaise: basePricePaise },
    intrinsicPaise,
    spotScenarios,
    timeScenarios,
    comparison,
    warnings,
    rounding: GREEK_MAP_ROUNDING_NOTE,
  };
}
