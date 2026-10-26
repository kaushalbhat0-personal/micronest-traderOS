import { z } from "zod";

import type { BasisPoints, Paise } from "@/types/domain";
import {
  parseLotSize,
  parsePercentToBps,
  parseRupeesToPaise,
  type RiskGuardInput,
} from "@/features/risk-guard/risk-guard";

/**
 * Input boundary for RiskGuard. Zod validates the raw form strings and
 * converts them to the integer domain input the engine operates on.
 *
 * Business rules (stop direction, lot affordability, target side) are NOT
 * validated here — they belong to the domain engine, which returns a
 * structured blocked result instead of a validation error.
 */

const MAX_PAISE = 10_000_000_000_00; // ₹100 crore in paise
const MAX_BPS = 10_000; // 100%
const MAX_LOT_SIZE = 1_000_000;

function rupeeField(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine((value) => parseRupeesToPaise(value) !== null, {
      message: `${label} must be a number with up to 2 decimals (e.g. 123.45).`,
    })
    .transform((value) => parseRupeesToPaise(value) as Paise)
    .refine((value) => value > 0, { message: `${label} must be greater than zero.` })
    .refine((value) => value <= MAX_PAISE, {
      message: `${label} is too large. Maximum is ₹100 crore.`,
    });
}

export const riskGuardFieldsSchema = z.object({
  capital: rupeeField("Capital"),
  riskPercent: z
    .string()
    .trim()
    .min(1, "Risk % is required.")
    .refine((value) => parsePercentToBps(value) !== null, {
      message: "Risk % must be a number with up to 2 decimals (e.g. 2.5).",
    })
    .transform((value) => parsePercentToBps(value) as BasisPoints)
    .refine((value) => value > 0, { message: "Risk % must be greater than zero." })
    .refine((value) => value <= MAX_BPS, { message: "Risk % cannot exceed 100." }),
  direction: z.enum(["long", "short"], { message: "Choose long or short." }),
  entry: rupeeField("Entry"),
  stop: rupeeField("Stop-loss"),
  lotSize: z
    .string()
    .trim()
    .min(1, "Lot size is required.")
    .refine((value) => parseLotSize(value) !== null, {
      message: "Lot size must be a whole number of 1 or more.",
    })
    .transform((value) => parseLotSize(value) as number)
    .refine((value) => value <= MAX_LOT_SIZE, { message: "Lot size is too large." }),
  target: z
    .string()
    .trim()
    .refine((value) => value === "" || parseRupeesToPaise(value) !== null, {
      message: "Target must be a number with up to 2 decimals, or left blank.",
    })
    .transform((value) => (value === "" ? undefined : (parseRupeesToPaise(value) as Paise)))
    .refine((value) => value === undefined || (value > 0 && value <= MAX_PAISE), {
      message: "Target must be greater than zero.",
    }),
});

/** Raw form strings as submitted by the UI. */
export type RiskGuardRawFields = {
  capital: string;
  riskPercent: string;
  direction: string;
  entry: string;
  stop: string;
  lotSize: string;
  target: string;
};

/** Validated integer domain input, ready for the engine. */
export type RiskGuardParsedFields = z.output<typeof riskGuardFieldsSchema>;

/**
 * Prefilled values carried from a TradePlan handoff. A subset of the raw
 * fields: only non-sensitive numeric/enumerated inputs ever travel in the URL.
 */
export type RiskGuardHandoffFields = Partial<
  Pick<RiskGuardRawFields, "direction" | "entry" | "stop" | "target">
>;

/**
 * Best-effort handoff parser for RiskGuard's own input boundary. Each query
 * value is re-validated with the same parsers and ranges as the form; invalid
 * or absent values are omitted, never trusted. Unknown keys are ignored, so a
 * hand-edited URL cannot smuggle anything past the Zod schema on submit.
 */
export function parseHandoffParams(
  params: Record<string, string | string[] | undefined>,
): RiskGuardHandoffFields {
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const handoff: RiskGuardHandoffFields = {};
  const direction = first(params.direction);
  if (direction === "long" || direction === "short") handoff.direction = direction;

  for (const key of ["entry", "stop", "target"] as const) {
    const raw = first(params[key])?.trim() ?? "";
    if (raw === "") continue;
    const paise = parseRupeesToPaise(raw);
    if (paise !== null && paise > 0 && paise <= MAX_PAISE) handoff[key] = raw;
  }

  return handoff;
}

export function toRiskGuardInput(parsed: RiskGuardParsedFields): RiskGuardInput {
  return {
    capitalPaise: parsed.capital,
    riskBps: parsed.riskPercent,
    direction: parsed.direction,
    entryPaise: parsed.entry,
    stopPaise: parsed.stop,
    lotSize: parsed.lotSize,
    ...(parsed.target === undefined ? {} : { targetPaise: parsed.target }),
  };
}
