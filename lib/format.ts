import type { Paise } from "@/types/domain";

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/**
 * Formats integer paise as whole rupees using Indian digit grouping.
 * Throws for non-integer input so a float can never silently reach the UI.
 */
export function formatInrFromPaise(amountPaise: Paise): string {
  if (!Number.isSafeInteger(amountPaise)) {
    throw new RangeError("amountPaise must be a safe integer");
  }

  return inrFormatter.format(amountPaise / 100);
}
