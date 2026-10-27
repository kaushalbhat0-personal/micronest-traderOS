import { z } from "zod";

import type { Paise } from "@/types/domain";
import {
  parseRupeesToPaise,
  STRIKE_LENS_MAX_PAISE,
  STRIKE_LENS_MAX_ROWS,
  STRIKE_LENS_MIN_ROWS,
  type StrikeLensInput,
  type StrikeLensOptionType,
} from "@/features/strike-lens/strike-lens";

/**
 * Input boundary for StrikeLens. Zod validates the raw form strings and
 * converts them to the integer domain input the engine operates on.
 *
 * A premium below intrinsic value is NOT a validation error — it is a domain
 * outcome (an inconsistent row) reported by the engine with a factual
 * reason, the same way RiskGuard reports invalid stops as blocked results
 * instead of validation errors.
 */

function paiseField(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine((value) => parseRupeesToPaise(value) !== null, {
      message: `${label} must be a number with up to 2 decimals (e.g. 123.45).`,
    })
    .transform((value) => parseRupeesToPaise(value) as Paise)
    .refine((value) => value > 0, { message: `${label} must be greater than zero.` })
    .refine((value) => value <= STRIKE_LENS_MAX_PAISE, {
      message: `${label} is too large. Maximum is ₹100 crore.`,
    });
}

const strikeRowSchema = z.object({
  strike: paiseField("Strike"),
  premium: paiseField("Premium"),
});

export const strikeLensFieldsSchema = z
  .object({
    spot: paiseField("Spot"),
    optionType: z.enum(["call", "put"], { message: "Choose CE or PE." }),
    rows: z
      .array(strikeRowSchema)
      .min(STRIKE_LENS_MIN_ROWS, "Add at least one strike to compare.")
      .max(STRIKE_LENS_MAX_ROWS, "Compare up to 5 strikes at a time."),
    expiryLabel: z
      .string()
      .trim()
      .max(30, "Expiry label must be 30 characters or fewer.")
      .transform((value) => (value === "" ? undefined : value)),
  })
  .superRefine((fields, ctx) => {
    const seen = new Map<number, number>();
    fields.rows.forEach((row, index) => {
      const first = seen.get(row.strike);
      if (first !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["rows", index, "strike"],
          message: `Strike matches row ${first + 1}. Each strike must be unique.`,
        });
      } else {
        seen.set(row.strike, index);
      }
    });
  });

/** Raw form strings as submitted by the UI. */
export type StrikeLensRawFields = {
  spot: string;
  optionType: string;
  rows: Array<{ strike: string; premium: string }>;
  expiryLabel: string;
};

/** Validated integer domain input, ready for the engine. */
export type StrikeLensParsedFields = z.output<typeof strikeLensFieldsSchema>;

/**
 * Prefilled value carried from another tool's handoff. Only the spot price
 * ever travels in the URL — never direction, narrative, quantity or strikes.
 */
export type StrikeLensHandoffFields = {
  spot?: string;
};

/**
 * Best-effort handoff parser for StrikeLens's own input boundary. The spot
 * value is re-validated with the same parser and range as the form; invalid
 * or absent values are omitted, never trusted. Unknown keys are ignored, so
 * a hand-edited URL cannot smuggle anything past the Zod schema on submit.
 */
export function parseHandoffParams(
  params: Record<string, string | string[] | undefined>,
): StrikeLensHandoffFields {
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const handoff: StrikeLensHandoffFields = {};
  const raw = first(params.spot)?.trim() ?? "";
  if (raw === "") return handoff;
  const paise = parseRupeesToPaise(raw);
  if (paise !== null && paise > 0 && paise <= STRIKE_LENS_MAX_PAISE) handoff.spot = raw;
  return handoff;
}

export function toStrikeLensInput(parsed: StrikeLensParsedFields): StrikeLensInput {
  return {
    spotPaise: parsed.spot,
    optionType: parsed.optionType as StrikeLensOptionType,
    rows: parsed.rows.map((row) => ({ strikePaise: row.strike, premiumPaise: row.premium })),
    ...(parsed.expiryLabel === undefined ? {} : { expiryLabel: parsed.expiryLabel }),
  };
}
