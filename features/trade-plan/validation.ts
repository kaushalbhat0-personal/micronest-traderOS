import { z } from "zod";

import type { Paise } from "@/types/domain";
import {
  parseRupeesToPaise,
  type TradePlanInput,
} from "@/features/trade-plan/trade-plan";

/**
 * Input boundary for TradePlan. Zod validates the raw form strings and
 * converts them to the domain input the engine operates on.
 *
 * Business rules (stop direction, target side) are NOT validated here — they
 * belong to the domain engine, which returns a structured incoherent result
 * instead of a validation error.
 */

const MAX_PAISE = 100_000_000_000; // ₹100 crore in paise

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

function textField(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .max(max, `${label} must be ${max} characters or fewer.`);
}

export const tradePlanFieldsSchema = z.object({
  direction: z.enum(["long", "short"], { message: "Choose long or short." }),
  entry: rupeeField("Entry"),
  stop: rupeeField("Stop-loss"),
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
  setupName: textField("Setup name", 80),
  thesis: textField("Thesis", 500),
  invalidation: textField("Invalidation", 280),
  notes: z
    .string()
    .trim()
    .max(500, "Notes must be 500 characters or fewer.")
    .transform((value) => (value === "" ? undefined : value)),
});

/** Raw form strings as submitted by the UI. */
export type TradePlanRawFields = {
  direction: string;
  entry: string;
  stop: string;
  target: string;
  setupName: string;
  thesis: string;
  invalidation: string;
  notes: string;
};

/** Validated domain input, ready for the engine. */
export type TradePlanParsedFields = z.output<typeof tradePlanFieldsSchema>;

export function toTradePlanInput(parsed: TradePlanParsedFields): TradePlanInput {
  return {
    direction: parsed.direction,
    entryPaise: parsed.entry,
    stopPaise: parsed.stop,
    ...(parsed.target === undefined ? {} : { targetPaise: parsed.target }),
    setupName: parsed.setupName,
    thesis: parsed.thesis,
    invalidation: parsed.invalidation,
    ...(parsed.notes === undefined ? {} : { notes: parsed.notes }),
  };
}
