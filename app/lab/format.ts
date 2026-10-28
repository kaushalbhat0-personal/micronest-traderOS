/**
 * M1-F presentation formatters — display strings only, never research math.
 *
 * Every formatter here consumes an already-computed frozen value and returns
 * the exact same value in readable form. Integer paise become rupees by an
 * exact decimal shift; rational display decimals are re-pointed by string
 * operations only. No floats, no rounding, no re-derivation of any metric.
 */

/** Exact Indian digit grouping for a non-negative integer string. */
function groupIndian(digits: string): string {
  if (digits.length <= 3) {
    return digits;
  }
  const tail = digits.slice(-3);
  let head = digits.slice(0, -3);
  const parts: string[] = [];
  while (head.length > 2) {
    parts.unshift(head.slice(-2));
    head = head.slice(0, -2);
  }
  parts.unshift(head);
  return `${parts.join(",")},${tail}`;
}

/** Exact rupees string for integer paise, e.g. -123456 → "-₹1,234.56". */
export function formatINR(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const frac = String(abs % 100).padStart(2, "0");
  return `${sign}₹${groupIndian(String(rupees))}.${frac}`;
}

/**
 * Percent string for an authoritative `RationalValue.decimal` fraction, e.g.
 * "0.333333" → "33.3333%". Shifts the decimal point by string operations
 * only, so the displayed digits are exactly the frozen digits.
 */
export function formatRatePercent(decimal: string): string {
  const match = /^(-?)(\d+)\.(\d+)$/.exec(decimal.trim());
  if (match === null) {
    throw new RangeError(`Cannot format "${decimal}" as a percent.`);
  }
  const sign = match[1] as string;
  const intPart = match[2] as string;
  const fracPart = match[3] as string;
  const head = `${intPart}${fracPart.slice(0, 2)}`.replace(/^0+(?=\d)/, "");
  const tail = fracPart.slice(2);
  return tail.length === 0 ? `${sign}${head}%` : `${sign}${head}.${tail}%`;
}
