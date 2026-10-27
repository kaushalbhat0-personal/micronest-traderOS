import { z } from "zod";

import type { Paise } from "@/types/domain";
import {
  parseQuantity,
  parseRupeesToPaise,
  TRADE_COST_MAX_PAISE,
  TRADE_COST_MAX_QUANTITY,
  type TradeCostInput,
} from "@/features/trade-cost/trade-cost";

/**
 * Input boundary for TradeCost. Zod validates the raw form strings and
 * converts them to the integer domain input the engine operates on.
 *
 * Short delivery is NOT rejected here: it is a domain outcome (unsupported),
 * reported by the engine with a factual reason — the same way RiskGuard
 * reports invalid stops as blocked results instead of validation errors.
 */

function priceField(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine((value) => parseRupeesToPaise(value) !== null, {
      message: `${label} must be a number with up to 2 decimals (e.g. 123.45).`,
    })
    .transform((value) => parseRupeesToPaise(value) as Paise)
    .refine((value) => value > 0, { message: `${label} must be greater than zero.` })
    .refine((value) => value <= TRADE_COST_MAX_PAISE, {
      message: `${label} is too large. Maximum is ₹100 crore.`,
    });
}

export const tradeCostFieldsSchema = z
  .object({
    direction: z.enum(["long", "short"], { message: "Choose long or short." }),
    mode: z.enum(["delivery", "intraday"], { message: "Choose delivery or intraday." }),
    buyPrice: priceField("Buy price"),
    sellPrice: priceField("Sell price"),
    quantity: z
      .string()
      .trim()
      .min(1, "Quantity is required.")
      .refine((value) => parseQuantity(value) !== null, {
        message: "Quantity must be a whole number of 1 or more.",
      })
      .transform((value) => parseQuantity(value) as number)
      .refine((value) => value <= TRADE_COST_MAX_QUANTITY, {
        message: "Quantity is too large. Maximum is 10,00,000 shares.",
      }),
    brokerage: z
      .string()
      .trim()
      .min(1, "Brokerage is required. Enter 0 when no brokerage is assumed.")
      .refine((value) => parseRupeesToPaise(value) !== null, {
        message: "Brokerage must be a number with up to 2 decimals (e.g. 40.00).",
      })
      .transform((value) => parseRupeesToPaise(value) as Paise)
      .refine((value) => value <= TRADE_COST_MAX_PAISE, {
        message: "Brokerage is too large. Maximum is ₹100 crore.",
      }),
  })
  .superRefine((fields, ctx) => {
    // Turnover guard without overflowing: price × qty must stay exactly
    // representable, checked via division. The engine re-guards the same way.
    for (const key of ["buyPrice", "sellPrice"] as const) {
      const price = fields[key];
      if (fields.quantity > 0 && price > Math.floor(Number.MAX_SAFE_INTEGER / fields.quantity)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "Price × quantity exceeds the exact calculation range. Reduce either.",
        });
      }
    }
  });

/** Raw form strings as submitted by the UI. */
export type TradeCostRawFields = {
  direction: string;
  mode: string;
  buyPrice: string;
  sellPrice: string;
  quantity: string;
  brokerage: string;
};

/** Validated integer domain input, ready for the engine. */
export type TradeCostParsedFields = z.output<typeof tradeCostFieldsSchema>;

/**
 * Prefilled values carried from a RiskGuard sizing. Only direction, entry,
 * target and quantity travel — never capital, risk %, narrative or brokerage.
 */
export type TradeCostHandoffFields = {
  direction?: "long" | "short";
  entry?: string;
  target?: string;
  quantity?: string;
};

/**
 * Best-effort handoff parser for TradeCost's input boundary. Each query value
 * is re-validated with the same parsers and ranges as the form; invalid or
 * absent values are omitted, never trusted. Unknown keys are ignored, so a
 * hand-edited URL cannot smuggle anything past the Zod schema on submit.
 */
export function parseHandoffParams(
  params: Record<string, string | string[] | undefined>,
): TradeCostHandoffFields {
  const first = (value: string | string[] | undefined): string | undefined =>
    Array.isArray(value) ? value[0] : value;

  const handoff: TradeCostHandoffFields = {};
  const direction = first(params.direction);
  if (direction === "long" || direction === "short") handoff.direction = direction;

  for (const key of ["entry", "target"] as const) {
    const raw = first(params[key])?.trim() ?? "";
    if (raw === "") continue;
    const paise = parseRupeesToPaise(raw);
    if (paise !== null && paise > 0 && paise <= TRADE_COST_MAX_PAISE) handoff[key] = raw;
  }

  const quantityRaw = first(params.quantity)?.trim() ?? "";
  if (quantityRaw !== "") {
    const quantity = parseQuantity(quantityRaw);
    if (quantity !== null && quantity <= TRADE_COST_MAX_QUANTITY) handoff.quantity = quantityRaw;
  }

  return handoff;
}

export function toTradeCostInput(parsed: TradeCostParsedFields): TradeCostInput {
  // Form carries buy/sell legs directly; entry/exit mapping happens at handoff
  // prefill time (long: buy=entry/sell=target; short: sell=entry/buy=target).
  return {
    direction: parsed.direction,
    mode: parsed.mode,
    entryPaise: parsed.direction === "long" ? parsed.buyPrice : parsed.sellPrice,
    exitPaise: parsed.direction === "long" ? parsed.sellPrice : parsed.buyPrice,
    quantity: parsed.quantity,
    brokeragePaise: parsed.brokerage,
  };
}
