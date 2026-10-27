import { z } from "zod";

import type { Paise } from "@/types/domain";
import {
  GREEK_MAP_DTE_DECIMALS,
  GREEK_MAP_MAX_DIVIDEND_DECIMAL,
  GREEK_MAP_MAX_DTE_DAYS,
  GREEK_MAP_MAX_PAISE,
  GREEK_MAP_MAX_RATE_DECIMAL,
  GREEK_MAP_MAX_VOLATILITY_DECIMAL,
  GREEK_MAP_MIN_DIVIDEND_DECIMAL,
  GREEK_MAP_MIN_DTE_DAYS,
  GREEK_MAP_MIN_RATE_DECIMAL,
  GREEK_MAP_MIN_VOLATILITY_DECIMAL,
  GREEK_MAP_PERCENT_DECIMALS,
  parseRupeesToPaise,
  type GreekMapInput,
  type GreekMapOptionType,
} from "@/features/greek-map/greek-map";

/**
 * Input boundary for GreekMap. Zod validates the raw form strings and
 * converts them to the domain input the engine operates on.
 *
 * Boundary policy for continuous inputs (DTE, volatility, rate, dividend
 * yield): the shape and the range are decided on the exact decimal string via
 * scaled-integer comparison — never by trusting an IEEE parse at the
 * boundary. Only after the string passes does the engine receive an IEEE
 * value derived from it. Money follows the product-wide integer-paise rule:
 * the string is split into rupees and paise, so 2-decimal input stays exact.
 *
 * A premium under intrinsic value, or outside the European arbitrage bounds,
 * is NOT a validation error — the engine reports those as informational
 * warnings and still calculates, the same way StrikeLens reports an
 * inconsistent row instead of rejecting it.
 */

/**
 * Exact decimal-string to scaled integer. "12.345" at scale 2 → 1234 only
 * when the fraction fits the scale; otherwise null. Returns null for
 * anything that is not a plain non-negative decimal, so binary
 * floating-point never decides the boundary.
 */
export function parseDecimalToScaledInt(raw: string, scaleDigits: number): number | null {
  const cleaned = raw.trim().replace(/,/g, "");
  const match = /^(\d+)(?:\.(\d+))?$/.exec(cleaned);
  if (!match) return null;
  const intPart = match[1] as string;
  const fracPart = (match[2] ?? "") as string;
  if (fracPart.length > scaleDigits) return null;
  const intValue = Number(intPart);
  if (!Number.isSafeInteger(intValue)) return null;
  const scaledFrac = Number(fracPart.padEnd(scaleDigits, "0") || "0");
  const scaled = intValue * 10 ** scaleDigits + scaledFrac;
  return Number.isSafeInteger(scaled) ? scaled : null;
}

function paiseField(label: string, { optional = false }: { optional?: boolean } = {}) {
  const required = optional ? z.string().trim() : z.string().trim().min(1, `${label} is required.`);
  const base = required
    .refine((value) => (optional && value === "" ? true : parseRupeesToPaise(value) !== null), {
      message: `${label} must be a number with up to 2 decimals (e.g. 123.45).`,
    })
    .transform((value) => (optional && value === "" ? undefined : parseRupeesToPaise(value)))
    .refine((value) => value === undefined || (value !== null && value > 0), {
      message: `${label} must be greater than zero.`,
    })
    .refine((value) => value === undefined || (value !== null && value <= GREEK_MAP_MAX_PAISE), {
      message: `${label} is too large. Limit is ₹100 crore.`,
    });
  return base;
}

function dteField() {
  return z
    .string()
    .trim()
    .min(1, "Days to expiry is required.")
    .refine((value) => parseDecimalToScaledInt(value, GREEK_MAP_DTE_DECIMALS) !== null, {
      message: "Days to expiry must be a number with up to 2 decimals (e.g. 30 or 30.5).",
    })
    .transform((value) => (parseDecimalToScaledInt(value, GREEK_MAP_DTE_DECIMALS) as number) / 100)
    .refine((value) => value >= GREEK_MAP_MIN_DTE_DAYS && value <= GREEK_MAP_MAX_DTE_DAYS, {
      message: `Days to expiry must be between ${GREEK_MAP_MIN_DTE_DAYS} and ${GREEK_MAP_MAX_DTE_DAYS} calendar days.`,
    });
}

/**
 * Percent field: the user types percent (20 means 20%). The boundary is
 * decided on the exact scaled integer (units of 0.0001%), so values such as
 * 0.1% or 20% never depend on binary float comparison. The transform emits
 * the percent number the engine converts to a decimal.
 */
function percentField(
  label: string,
  minDecimal: number,
  maxDecimal: number,
  { optionalDefault = false }: { optionalDefault?: boolean } = {},
) {
  const minScaled = Math.round(minDecimal * 100 * 10 ** GREEK_MAP_PERCENT_DECIMALS);
  const maxScaled = Math.round(maxDecimal * 100 * 10 ** GREEK_MAP_PERCENT_DECIMALS);
  const minLabel = formatPercentLabel(minDecimal);
  const maxLabel = formatPercentLabel(maxDecimal);
  return z
    .string()
    .trim()
    .min(
      1,
      optionalDefault
        ? `${label} is required. Type 0 when the assumption is zero.`
        : `${label} is required.`,
    )
    .refine((value) => parseDecimalToScaledInt(value, GREEK_MAP_PERCENT_DECIMALS) !== null, {
      message: `${label} must be a number with up to ${GREEK_MAP_PERCENT_DECIMALS} decimals (e.g. 6 or 6.5).`,
    })
    .transform(
      (value) =>
        (parseDecimalToScaledInt(value, GREEK_MAP_PERCENT_DECIMALS) as number) /
        10 ** GREEK_MAP_PERCENT_DECIMALS,
    )
    .refine(
      (value) => {
        const scaled = Math.round(value * 10 ** GREEK_MAP_PERCENT_DECIMALS);
        return scaled >= minScaled && scaled <= maxScaled;
      },
      {
        message: `${label} must be between ${minLabel} and ${maxLabel}.`,
      },
    );
}

function formatPercentLabel(decimal: number): string {
  const percent = decimal * 100;
  return `${Number.isInteger(percent) ? percent.toFixed(0) : String(percent)}%`;
}

export const greekMapFieldsSchema = z.object({
  optionType: z.enum(["call", "put"], { message: "Choose CE or PE." }),
  spot: paiseField("Spot"),
  strike: paiseField("Strike"),
  dte: dteField(),
  volatility: percentField(
    "Volatility",
    GREEK_MAP_MIN_VOLATILITY_DECIMAL,
    GREEK_MAP_MAX_VOLATILITY_DECIMAL,
  ),
  rate: percentField("Risk-free rate", GREEK_MAP_MIN_RATE_DECIMAL, GREEK_MAP_MAX_RATE_DECIMAL),
  dividend: percentField(
    "Dividend yield",
    GREEK_MAP_MIN_DIVIDEND_DECIMAL,
    GREEK_MAP_MAX_DIVIDEND_DECIMAL,
  ),
  premium: paiseField("Your premium", { optional: true }),
  expiryLabel: z
    .string()
    .trim()
    .max(30, "Expiry label must be 30 characters or fewer.")
    .transform((value) => (value === "" ? undefined : value)),
});

/** Raw form strings as submitted by the UI. */
export type GreekMapRawFields = {
  optionType: string;
  spot: string;
  strike: string;
  dte: string;
  volatility: string;
  rate: string;
  dividend: string;
  premium: string;
  expiryLabel: string;
};

/** Validated form values, ready for the engine. Percents stay in percent units here. */
export type GreekMapParsedFields = z.output<typeof greekMapFieldsSchema>;

/**
 * Prefilled values carried from StrikeLens. Only the option type, strike and
 * spot ever travel in the URL — never premium, DTE, IV, rate, dividend,
 * quantity, target, stop or narrative. Unknown keys are ignored.
 */
export type GreekMapHandoffFields = {
  optionType?: string;
  spot?: string;
  strike?: string;
};

/**
 * Accepted-key handoff parser for GreekMap's own input boundary. Each value
 * is re-validated with the same parser and range used by the form; absent or
 * malformed values are dropped, never trusted. Nothing is stored.
 */
export function parseHandoffParams(
  params: Record<string, string | string[] | undefined>,
): GreekMapHandoffFields {
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const handoff: GreekMapHandoffFields = {};

  const rawType = (first(params.type) ?? "").trim().toLowerCase();
  if (rawType === "call" || rawType === "put") handoff.optionType = rawType;

  for (const key of ["spot", "strike"] as const) {
    const raw = (first(params[key]) ?? "").trim();
    if (raw === "") continue;
    const paise = parseRupeesToPaise(raw);
    if (paise !== null && paise > 0 && paise <= GREEK_MAP_MAX_PAISE) {
      handoff[key] = raw;
    }
  }

  return handoff;
}

export function toGreekMapInput(parsed: GreekMapParsedFields): GreekMapInput {
  return {
    optionType: parsed.optionType as GreekMapOptionType,
    spotPaise: parsed.spot as Paise,
    strikePaise: parsed.strike as Paise,
    dteDays: parsed.dte,
    volatilityDecimal: parsed.volatility / 100,
    rateDecimal: parsed.rate / 100,
    dividendDecimal: parsed.dividend / 100,
    ...(parsed.premium === undefined ? {} : { premiumPaise: parsed.premium as Paise }),
    ...(parsed.expiryLabel === undefined ? {} : { expiryLabel: parsed.expiryLabel }),
  };
}
