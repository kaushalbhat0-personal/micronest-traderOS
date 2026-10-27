import type { Paise } from "@/types/domain";
import { COST_RATE_SET, type RateFraction } from "@/config/cost-rates";

/**
 * TradeCost domain — the single source of truth for the TC-001 calculation.
 *
 * Estimates transaction costs for an NSE cash-equity trade (delivery or
 * intraday): gross P&L → per-charge costs → net P&L → breakeven exit.
 * An estimator, not a contract-note replica: DP charges, slippage, penalties
 * and account fees are excluded and disclosed on the receipt.
 *
 * Pure TypeScript: no React, no browser APIs, no clock, no network. All money
 * is integer paise; all rates are exact rational fractions. The engine never
 * throws for ordinary user-decision outcomes; it returns an invalid or
 * unsupported result with a factual reason.
 */

export const TRADE_COST_FORMULA_ID = "TC-001" as const;

/** Where rounding happens. Stated explicitly so the receipt can show it. */
export const TRADE_COST_ROUNDING_NOTE =
  "Half-up to paise per charge leg; GST on exact amounts, rounded once" as const;

export const TRADE_COST_RATE_SET_ID = COST_RATE_SET.id;
export const TRADE_COST_EFFECTIVE_FROM = COST_RATE_SET.effectiveFrom;

/** ₹100 crore in paise — the product-wide money cap, shared with RiskGuard. */
export const TRADE_COST_MAX_PAISE = 100_000_000_000;

/** Largest share count accepted. Bound together with the turnover guard below. */
export const TRADE_COST_MAX_QUANTITY = 1_000_000;

export type TradeCostDirection = "long" | "short";
export type TradeCostMode = "delivery" | "intraday";

export interface TradeCostInput {
  direction: TradeCostDirection;
  mode: TradeCostMode;
  entryPaise: Paise;
  exitPaise: Paise;
  /** Share count. Always >= 1. */
  quantity: number;
  /** Round-trip brokerage assumption, both legs. Explicit 0 allowed. */
  brokeragePaise: Paise;
}

export interface TradeCostBreakevenOk {
  status: "ok";
  /** Exit price in paise with net P&L >= 0 (sell price for long, cover for short). */
  pricePaise: Paise;
  /** Net P&L at the breakeven price (>= 0 by construction). */
  residualPaise: Paise;
}

export interface TradeCostBreakevenUnreachable {
  status: "unreachable";
  reason: string;
}

export interface TradeCostComputed {
  status: "computed";
  formulaId: typeof TRADE_COST_FORMULA_ID;
  inputs: TradeCostInput;
  buyPricePaise: Paise;
  sellPricePaise: Paise;
  turnoverBuyPaise: Paise;
  turnoverSellPaise: Paise;
  grossPnlPaise: Paise;
  brokeragePaise: Paise;
  sttPaise: Paise;
  nseTxnPaise: Paise;
  nseIpftPaise: Paise;
  stampDutyPaise: Paise;
  sebiFeesPaise: Paise;
  gstPaise: Paise;
  totalChargesPaise: Paise;
  netPnlPaise: Paise;
  /** totalCharges / gross, display only. Null when gross <= 0 (a ratio would mislead). */
  costToGrossRatio: number | null;
  breakeven: TradeCostBreakevenOk | TradeCostBreakevenUnreachable;
  /** One plain factual line about what costs do to the economics. */
  verdict: string;
  rounding: typeof TRADE_COST_ROUNDING_NOTE;
  rateSetId: string;
  effectiveFrom: string;
}

export type TradeCostInvalidCode = "invalid_input";

export interface TradeCostInvalid {
  status: "invalid";
  formulaId: typeof TRADE_COST_FORMULA_ID;
  code: TradeCostInvalidCode;
  reason: string;
  inputs: TradeCostInput;
  rounding: typeof TRADE_COST_ROUNDING_NOTE;
  rateSetId: string;
  effectiveFrom: string;
}

export type TradeCostUnsupportedCode = "short_delivery_unsupported";

export interface TradeCostUnsupported {
  status: "unsupported";
  formulaId: typeof TRADE_COST_FORMULA_ID;
  code: TradeCostUnsupportedCode;
  reason: string;
  inputs: TradeCostInput;
  rounding: typeof TRADE_COST_ROUNDING_NOTE;
  rateSetId: string;
  effectiveFrom: string;
}

export type TradeCostResult = TradeCostComputed | TradeCostInvalid | TradeCostUnsupported;

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

/** Parses a share count: digits only, integer >= 1. */
export function parseQuantity(raw: string): number | null {
  const cleaned = raw.trim();
  if (!/^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned);
  return Number.isSafeInteger(value) && value >= 1 ? value : null;
}

/**
 * Exact rational amount: whole + fracNum/fracDen with 0 <= fracNum < fracDen.
 * Lets GST be computed on exact pre-rounding values (Model 2: no double
 * rounding) while receipt lines show each leg rounded once.
 */
type ExactAmount = {
  whole: number;
  fracNum: number;
  fracDen: number;
};

/**
 * Splits T × num/den into integer and fractional parts with exact integer
 * arithmetic (T >= 0 required): T = a·den + b, so
 * T·num/den = a·num + (b·num)/den. With turnover T <= Number.MAX_SAFE_INTEGER
 * every intermediate is exactly representable: b·num < den·num (<= ~3.1e13
 * for the finest v1 rate) and a·num <= the result itself (<= turnover scale).
 */
function mulParts(T: number, rate: RateFraction): ExactAmount {
  const a = Math.floor(T / rate.den);
  const b = T % rate.den;
  const bNum = b * rate.num;
  return {
    whole: a * rate.num + Math.floor(bNum / rate.den),
    fracNum: bNum % rate.den,
    fracDen: rate.den,
  };
}

/**
 * Rounds an exact amount half-up to integer paise. Exact ties round upward.
 */
function roundExact(parts: ExactAmount): Paise {
  return parts.whole + (2 * parts.fracNum >= parts.fracDen ? 1 : 0);
}

/**
 * roundHalfUp(T × num/den) as one exact integer operation — no intermediate
 * floor that would discard the sub-paise fraction, no floating-point.
 * Exact ties (.5 paise) round upward. T >= 0 required.
 */
function roundHalfUpMul(T: number, rate: RateFraction): Paise {
  return roundExact(mulParts(T, rate));
}

/** Exact per-leg charge lines for one side's turnover (unrounded). */
type LegExact = {
  stt: ExactAmount;
  txn: ExactAmount;
  ipft: ExactAmount;
  stamp: ExactAmount;
  sebi: ExactAmount;
};

/** Per-leg charges for one side's turnover. Each line rounded once (half-up). */
function chargeLeg(turnover: number, opts: { stt: RateFraction; stamp: RateFraction }): {
  rounded: { stt: Paise; nseTxn: Paise; ipft: Paise; stamp: Paise; sebi: Paise };
  exact: LegExact;
} {
  const exact: LegExact = {
    stt: mulParts(turnover, opts.stt),
    txn: mulParts(turnover, COST_RATE_SET.nseTxn),
    ipft: mulParts(turnover, COST_RATE_SET.ipft),
    stamp: mulParts(turnover, opts.stamp),
    sebi: mulParts(turnover, COST_RATE_SET.sebi),
  };
  return {
    rounded: {
      stt: roundHalfUpMul(turnover, opts.stt),
      nseTxn: roundHalfUpMul(turnover, COST_RATE_SET.nseTxn),
      ipft: roundHalfUpMul(turnover, COST_RATE_SET.ipft),
      stamp: roundHalfUpMul(turnover, opts.stamp),
      sebi: roundHalfUpMul(turnover, COST_RATE_SET.sebi),
    },
    exact,
  };
}

const ZERO_RATE: RateFraction = { num: 0, den: 1 };

/** Selects the STT/stamp rule rows for the instrument; direction picks legs. */
function chargeBothLegs(
  turnoverBuy: number,
  turnoverSell: number,
  mode: TradeCostMode,
): { buy: ReturnType<typeof chargeLeg>; sell: ReturnType<typeof chargeLeg> } {
  const sttBuy =
    mode === "delivery" ? COST_RATE_SET.stt.deliveryBuy : COST_RATE_SET.stt.intradayBuy;
  const sttSell =
    mode === "delivery" ? COST_RATE_SET.stt.deliverySell : COST_RATE_SET.stt.intradaySell;
  const stampBuy =
    mode === "delivery" ? COST_RATE_SET.stamp.deliveryBuy : COST_RATE_SET.stamp.intradayBuy;
  return {
    buy: chargeLeg(turnoverBuy, { stt: sttBuy, stamp: stampBuy }),
    // Stamp duty applies to the buy transfer only, never the sale.
    sell: chargeLeg(turnoverSell, { stt: sttSell, stamp: ZERO_RATE }),
  };
}

/**
 * GST = roundHalfUp((brokerage + exact NSE txn + exact IPFT + exact SEBI) × 18/100):
 * Model 2 — one rounding on the exact taxable base, never on already-rounded
 * lines. Decomposed so every intermediate is a safe integer: wholeTaxable
 * holds the integer parts (brokerage capped at the product money cap, so the
 * whole base stays at turnover scale); fracBillionths holds the fractional
 * parts scaled to billionths (< 6e9 for the six taxable lines); the final
 * half-up test compares f_a·1e11 + r2·100 against 5e12 (both addends < 1e13).
 */
function computeGst(
  brokeragePaise: number,
  legs: { buy: ReturnType<typeof chargeLeg>; sell: ReturnType<typeof chargeLeg> },
): Paise {
  const wholeTaxable =
    brokeragePaise +
    legs.buy.exact.txn.whole +
    legs.sell.exact.txn.whole +
    legs.buy.exact.ipft.whole +
    legs.sell.exact.ipft.whole +
    legs.buy.exact.sebi.whole +
    legs.sell.exact.sebi.whole;
  // Fractional taxable parts, scaled to billionths of a paise. Each addend is
  // fracNum × (1e9/fracDen) < 1e9 (txn and IPFT dens are 1e9, SEBI den is 1e6).
  const fracBillionths =
    legs.buy.exact.txn.fracNum * (1_000_000_000 / legs.buy.exact.txn.fracDen) +
    legs.sell.exact.txn.fracNum * (1_000_000_000 / legs.sell.exact.txn.fracDen) +
    legs.buy.exact.ipft.fracNum * (1_000_000_000 / legs.buy.exact.ipft.fracDen) +
    legs.sell.exact.ipft.fracNum * (1_000_000_000 / legs.sell.exact.ipft.fracDen) +
    legs.buy.exact.sebi.fracNum * (1_000_000_000 / legs.buy.exact.sebi.fracDen) +
    legs.sell.exact.sebi.fracNum * (1_000_000_000 / legs.sell.exact.sebi.fracDen);
  const base = mulParts(wholeTaxable, COST_RATE_SET.gst.rate);
  // Exact sub-paise GST from the fractional base: (fracBillionths/1e9) × 18/100.
  const fracGstNum = fracBillionths * COST_RATE_SET.gst.rate.num;
  const fracGstDen = 1_000_000_000 * COST_RATE_SET.gst.rate.den;
  const fracGstWhole = Math.floor(fracGstNum / fracGstDen);
  const fracGstRem = fracGstNum % fracGstDen;
  // Combined fractional paise = base.fracNum/base.fracDen + fracGstRem/fracGstDen.
  // Half-up, cross-multiplied: f_a·1e11 + r2·100 >= 5e12 (both addends < 1e13).
  const roundsUp =
    base.fracNum * 100_000_000_000 + fracGstRem * 100 >= 5_000_000_000_000;
  return base.whole + fracGstWhole + (roundsUp ? 1 : 0);
}

function isPositiveSafeInt(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function invalid(reason: string, inputs: TradeCostInput): TradeCostInvalid {
  return {
    status: "invalid",
    formulaId: TRADE_COST_FORMULA_ID,
    code: "invalid_input",
    reason,
    inputs,
    rounding: TRADE_COST_ROUNDING_NOTE,
    rateSetId: TRADE_COST_RATE_SET_ID,
    effectiveFrom: TRADE_COST_EFFECTIVE_FROM,
  };
}

function unsupported(
  code: TradeCostUnsupportedCode,
  reason: string,
  inputs: TradeCostInput,
): TradeCostUnsupported {
  return {
    status: "unsupported",
    formulaId: TRADE_COST_FORMULA_ID,
    code,
    reason,
    inputs,
    rounding: TRADE_COST_ROUNDING_NOTE,
    rateSetId: TRADE_COST_RATE_SET_ID,
    effectiveFrom: TRADE_COST_EFFECTIVE_FROM,
  };
}

/**
 * Guards turnover multiplication without overflowing: true when price × qty
 * would exceed the exact integer-safe range. Uses division, never the product.
 */
function turnoverOverflows(pricePaise: number, quantity: number): boolean {
  return quantity > 0 && pricePaise > Math.floor(Number.MAX_SAFE_INTEGER / quantity);
}

const INVALID_REASON =
  "One or more values are outside the valid range. Direction, mode, entry, exit, quantity and brokerage must be valid, and each leg turnover must stay within the exact integer range.";

/**
 * Exact (unrounded) fractional terms of every charge at a candidate exit
 * price, for the overflow-safe sign test below.
 */
function exactFracTerms(
  turnoverBuy: number,
  turnoverSell: number,
  mode: TradeCostMode,
  brokeragePaise: number,
): { intCharges: number; fracs: Array<{ n: number; d: number }> } {
  const legs = chargeBothLegs(turnoverBuy, turnoverSell, mode);
  // Integer parts of every leg line.
  let intCharges = brokeragePaise;
  const fracs: Array<{ n: number; d: number }> = [];
  for (const leg of [legs.buy.exact, legs.sell.exact]) {
    for (const line of [leg.stt, leg.txn, leg.ipft, leg.stamp, leg.sebi]) {
      intCharges += line.whole;
      fracs.push({ n: line.fracNum, d: line.fracDen });
    }
  }
  // GST exact parts (Model 2): integer part joins intCharges, two fractional
  // parts join the term list. Same decomposition as computeGst.
  const wholeTaxable =
    brokeragePaise +
    legs.buy.exact.txn.whole +
    legs.sell.exact.txn.whole +
    legs.buy.exact.ipft.whole +
    legs.sell.exact.ipft.whole +
    legs.buy.exact.sebi.whole +
    legs.sell.exact.sebi.whole;
  const fracBillionths =
    legs.buy.exact.txn.fracNum * (1_000_000_000 / legs.buy.exact.txn.fracDen) +
    legs.sell.exact.txn.fracNum * (1_000_000_000 / legs.sell.exact.txn.fracDen) +
    legs.buy.exact.ipft.fracNum * (1_000_000_000 / legs.buy.exact.ipft.fracDen) +
    legs.sell.exact.ipft.fracNum * (1_000_000_000 / legs.sell.exact.ipft.fracDen) +
    legs.buy.exact.sebi.fracNum * (1_000_000_000 / legs.buy.exact.sebi.fracDen) +
    legs.sell.exact.sebi.fracNum * (1_000_000_000 / legs.sell.exact.sebi.fracDen);
  const gstBase = mulParts(wholeTaxable, COST_RATE_SET.gst.rate);
  const fracGstNum = fracBillionths * COST_RATE_SET.gst.rate.num;
  const fracGstDen = 1_000_000_000 * COST_RATE_SET.gst.rate.den;
  intCharges += gstBase.whole + Math.floor(fracGstNum / fracGstDen);
  fracs.push({ n: gstBase.fracNum, d: gstBase.fracDen });
  fracs.push({ n: fracGstNum % fracGstDen, d: fracGstDen });
  return { intCharges, fracs };
}

/**
 * Common denominator dividing every v1 fractional denominator
 * (1000, 1e6, 1e5, 1e9, 1e11, 100, 1e13). Lets the exact sign test below
 * stay in safe integers — no floating-point, no BigInt.
 */
const EXACT_DEN = 10_000_000_000_000;

/**
 * Sign of the exact (unrounded) net P&L at a candidate exit price.
 *
 * net_exact = G − M − Σ(f_i/d_i), with G the integer gross-minus-brokerage
 * and M the integer charge parts. R = G − M decides directly when R < 0
 * (negative: every fraction is non-negative) or R >= n (non-negative: the
 * fractional sum is < n terms); otherwise the exact comparison R·D vs
 * Σ f_i·(D/d_i) is formed with both sides < ~1.3e14. All inputs are safe
 * integers because the caller only passes turnover-guarded prices.
 */
function exactNetIsNonNegative(args: {
  turnoverExit: number;
  turnoverFixed: number;
  sign: 1 | -1;
  brokeragePaise: number;
  mode: TradeCostMode;
  exitIsSell: boolean;
}): boolean {
  const { turnoverExit, turnoverFixed, sign, brokeragePaise, mode, exitIsSell } = args;
  // Note: brokerage is counted once, inside intCharges below — not here.
  const grossInt = sign * (turnoverExit - turnoverFixed);
  const { turnoverBuy, turnoverSell } = exitIsSell
    ? { turnoverBuy: turnoverFixed, turnoverSell: turnoverExit }
    : { turnoverBuy: turnoverExit, turnoverSell: turnoverFixed };
  const { intCharges, fracs } = exactFracTerms(turnoverBuy, turnoverSell, mode, brokeragePaise);
  const remainder = grossInt - intCharges;
  if (remainder < 0) return false;
  if (remainder >= fracs.length) return true;
  let scaled = 0;
  for (const term of fracs) {
    scaled += term.n * (EXACT_DEN / term.d);
  }
  return remainder * EXACT_DEN >= scaled;
}

type BreakevenSearch = {
  mode: TradeCostMode;
  quantity: number;
  turnoverFixed: number;
  sign: 1 | -1;
  brokeragePaise: number;
  exitIsSell: boolean;
  /** Highest exit price the search may consider (product cap + turnover guard). */
  hiCap: number;
};

function signAt(exitPricePaise: number, search: BreakevenSearch): boolean {
  return exactNetIsNonNegative({
    turnoverExit: exitPricePaise * search.quantity,
    turnoverFixed: search.turnoverFixed,
    sign: search.sign,
    brokeragePaise: search.brokeragePaise,
    mode: search.mode,
    exitIsSell: search.exitIsSell,
  });
}

/**
 * TC-001 breakeven: long → smallest exit price with net >= 0; short →
 * largest exit price with net >= 0.
 *
 * Step 1 — exact root: the exact (unrounded) net is strictly monotone in the
 * exit price (each paise of exit moves gross by `quantity` paise while exit-
 * side charges move by quantity × combined exit rate ≈ quantity × 0.11%,
 * so the slope keeps the sign of the trade direction). Integer binary search
 * on the exact sign — never on the rounded result.
 *
 * Step 2 — real-engine verification: the rounded net deviates from the exact
 * net by at most ±(5 × 0.5) = ±2.5 paise (five exit-varying rounded lines:
 * STT/txn/IPFT/SEBI on the exit side + GST), while the exact net moves
 * >= ~1 paise per paise-step (quantity >= 1). So the true rounded breakeven
 * lies within ±3 paise of the exact root — evaluated exhaustively with the
 * real engine. The ±3 window is derived from this bound, not a tolerance.
 */
function findBreakeven(
  search: BreakevenSearch,
  netAt: (exitPricePaise: number) => Paise,
): TradeCostBreakevenOk | TradeCostBreakevenUnreachable {
  const { hiCap } = search;
  // Doubling to bracket a price with exact net >= 0 (long) — for short the
  // bracket is mirrored below.
  if (search.sign === 1) {
    // Start from 1 and double until the exact net turns non-negative.
    let upper = 1;
    while (!signAt(upper, search)) {
      if (upper >= hiCap) {
        return {
          status: "unreachable",
          reason:
            "No exit price within the allowed range overcomes the transaction costs. The planned gain is too small for this quantity and brokerage.",
        };
      }
      upper = Math.min(upper * 2, hiCap);
    }
    let lo = 1;
    while (lo < upper) {
      const mid = Math.floor((lo + upper) / 2);
      if (signAt(mid, search)) upper = mid;
      else lo = mid + 1;
    }
    const root = lo;
    let best: number | null = null;
    for (let p = root - 3; p <= root + 3; p += 1) {
      if (p < 1 || p > hiCap) continue;
      if (netAt(p) >= 0 && (best === null || p < best)) best = p;
    }
    if (best === null) {
      return {
        status: "unreachable",
        reason:
          "No exit price within the allowed range overcomes the transaction costs. The planned gain is too small for this quantity and brokerage.",
      };
    }
    return { status: "ok", pricePaise: best, residualPaise: netAt(best) };
  }
  // Short: largest exit (cover) price with exact net >= 0.
  if (!signAt(1, search)) {
    return {
      status: "unreachable",
      reason:
        "No cover price within the allowed range overcomes the transaction costs. The planned gain is too small for this quantity and brokerage.",
    };
  }
  let lower = 1;
  let upper = hiCap;
  if (!signAt(upper, search)) {
    while (lower + 1 < upper) {
      const mid = Math.floor((lower + upper) / 2);
      if (signAt(mid, search)) lower = mid;
      else upper = mid;
    }
  } else {
    lower = upper;
  }
  const root = lower;
  let best: number | null = null;
  for (let p = root - 3; p <= root + 3; p += 1) {
    if (p < 1 || p > hiCap) continue;
    if (netAt(p) >= 0 && (best === null || p > best)) best = p;
  }
  if (best === null) {
    return {
      status: "unreachable",
      reason:
        "No cover price within the allowed range overcomes the transaction costs. The planned gain is too small for this quantity and brokerage.",
    };
  }
  return { status: "ok", pricePaise: best, residualPaise: netAt(best) };
}

/**
 * TC-001: estimate transaction costs for a planned NSE cash-equity position.
 * Integer paise throughout; rates are exact fractions from the active
 * versioned rate set. Never throws for user-decision outcomes.
 */
export function calculateCosts(input: TradeCostInput): TradeCostResult {
  const { direction, mode, entryPaise, exitPaise, quantity, brokeragePaise } = input;

  if (
    (direction !== "long" && direction !== "short") ||
    (mode !== "delivery" && mode !== "intraday") ||
    !isPositiveSafeInt(entryPaise) ||
    !isPositiveSafeInt(exitPaise) ||
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    !Number.isSafeInteger(brokeragePaise) ||
    brokeragePaise < 0 ||
    entryPaise > TRADE_COST_MAX_PAISE ||
    exitPaise > TRADE_COST_MAX_PAISE ||
    quantity > TRADE_COST_MAX_QUANTITY ||
    brokeragePaise > TRADE_COST_MAX_PAISE ||
    turnoverOverflows(entryPaise, quantity) ||
    turnoverOverflows(exitPaise, quantity)
  ) {
    return invalid(INVALID_REASON, input);
  }

  if (direction === "short" && mode === "delivery") {
    return unsupported(
      "short_delivery_unsupported",
      "Retail short sales settle intraday. Switch the mode to intraday, or change the direction to long for delivery.",
      input,
    );
  }

  const buyPricePaise = direction === "long" ? entryPaise : exitPaise;
  const sellPricePaise = direction === "long" ? exitPaise : entryPaise;
  const turnoverBuyPaise = buyPricePaise * quantity;
  const turnoverSellPaise = sellPricePaise * quantity;
  // Buy/sell legs are already direction-mapped above, so gross is sell − buy
  // for both directions (long: exit − entry; short: entry − exit).
  const grossPnlPaise = turnoverSellPaise - turnoverBuyPaise;

  const legs = chargeBothLegs(turnoverBuyPaise, turnoverSellPaise, mode);
  const sttPaise = legs.buy.rounded.stt + legs.sell.rounded.stt;
  const nseTxnPaise = legs.buy.rounded.nseTxn + legs.sell.rounded.nseTxn;
  const nseIpftPaise = legs.buy.rounded.ipft + legs.sell.rounded.ipft;
  const stampDutyPaise = legs.buy.rounded.stamp + legs.sell.rounded.stamp;
  const sebiFeesPaise = legs.buy.rounded.sebi + legs.sell.rounded.sebi;
  const gstPaise = computeGst(brokeragePaise, legs);
  const totalChargesPaise =
    brokeragePaise + sttPaise + nseTxnPaise + nseIpftPaise + stampDutyPaise + sebiFeesPaise + gstPaise;
  const netPnlPaise = grossPnlPaise - totalChargesPaise;
  const costToGrossRatio = grossPnlPaise > 0 ? totalChargesPaise / grossPnlPaise : null;

  const verdict =
    grossPnlPaise > 0 && totalChargesPaise <= grossPnlPaise
      ? `Charges consume ${((costToGrossRatio as number) * 100).toFixed(1)}% of the planned gain.`
      : grossPnlPaise > 0
        ? "Charges exceed the planned gain."
        : grossPnlPaise === 0
          ? "No price gain at these levels — charges apply in full."
          : "The trade loses money before costs; charges add to the loss.";

  const exitIsSell = direction === "long";
  const turnoverFixed = exitIsSell ? turnoverBuyPaise : turnoverSellPaise;
  const hiCap = Math.min(
    TRADE_COST_MAX_PAISE,
    Math.floor(Number.MAX_SAFE_INTEGER / quantity),
  );
  const search: BreakevenSearch = {
    mode,
    quantity,
    turnoverFixed,
    sign: direction === "long" ? 1 : -1,
    brokeragePaise,
    exitIsSell,
    hiCap,
  };
  const netAt = (exitPricePaise: number): Paise => {
    const tExit = exitPricePaise * quantity;
    const tBuy = exitIsSell ? turnoverFixed : tExit;
    const tSell = exitIsSell ? tExit : turnoverFixed;
    // Legs are direction-mapped: gross is always sell − buy.
    const gross = tSell - tBuy;
    const side = chargeBothLegs(tBuy, tSell, mode);
    const total =
      brokeragePaise +
      side.buy.rounded.stt +
      side.sell.rounded.stt +
      side.buy.rounded.nseTxn +
      side.sell.rounded.nseTxn +
      side.buy.rounded.ipft +
      side.sell.rounded.ipft +
      side.buy.rounded.stamp +
      side.sell.rounded.stamp +
      side.buy.rounded.sebi +
      side.sell.rounded.sebi +
      computeGst(brokeragePaise, side);
    return gross - total;
  };
  const breakeven = findBreakeven(search, netAt);

  return {
    status: "computed",
    formulaId: TRADE_COST_FORMULA_ID,
    inputs: input,
    buyPricePaise,
    sellPricePaise,
    turnoverBuyPaise,
    turnoverSellPaise,
    grossPnlPaise,
    brokeragePaise,
    sttPaise,
    nseTxnPaise,
    nseIpftPaise,
    stampDutyPaise,
    sebiFeesPaise,
    gstPaise,
    totalChargesPaise,
    netPnlPaise,
    costToGrossRatio,
    breakeven,
    verdict,
    rounding: TRADE_COST_ROUNDING_NOTE,
    rateSetId: TRADE_COST_RATE_SET_ID,
    effectiveFrom: TRADE_COST_EFFECTIVE_FROM,
  };
}
