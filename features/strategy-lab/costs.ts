import { COST_RATE_SET } from "@/config/cost-rates";
import type { Paise } from "@/types/domain";

/**
 * Strategy Lab fill-cost boundary (M1-C) — slippage and per-fill statutory
 * costs for NSE cash-equity delivery research.
 *
 * Owns its own calculation boundary: it reads the shared versioned rate DATA
 * (`config/cost-rates.ts`, the single rate source) but implements Strategy
 * Lab pricing locally. No import from `features/trade-cost/`, no shared
 * abstraction. All arithmetic is exact integer math; money never touches a
 * float. Throws RangeError only for programmer-precondition violations
 * (non-integer/negative inputs); validated run inputs never reach those paths.
 */

/** Locked M1 fixture brokerage: ₹20 per fill, both legs. */
export const BACKTEST_BROKERAGE_PAISE = 2000;

/** The only supported M1 slippage legs: 0×, 1× (base 5 bps), 2×. */
export const BACKTEST_ALLOWED_SLIPPAGE_BPS = [0, 5, 10] as const;

export type BacktestSide = "buy" | "sell";

export interface SlippedFill {
  rawPricePaise: Paise;
  slipPaise: Paise;
  fillPricePaise: Paise;
}

/** roundHalfUp(numer / denom) for non-negative integers. */
function roundHalfUp(numer: bigint, denom: bigint): number {
  const result = (2n * numer + denom) / (2n * denom);
  if (result > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("Charge exceeds safe integer range.");
  }
  return Number(result);
}

/**
 * Applies one-sided slippage: buys fill higher, sells fill lower.
 * Sell fills are floored at 1 paise. Applied exactly once per fill —
 * the slipped price IS the fill price; nothing deducts slippage again.
 */
export function applySlippage(
  rawPricePaise: number,
  side: BacktestSide,
  slippageBps: number,
): SlippedFill {
  if (!Number.isSafeInteger(rawPricePaise) || rawPricePaise <= 0) {
    throw new RangeError("rawPricePaise must be a positive safe integer.");
  }
  if (!Number.isSafeInteger(slippageBps) || slippageBps < 0) {
    throw new RangeError("slippageBps must be a non-negative safe integer.");
  }
  const slip = Math.floor((rawPricePaise * slippageBps) / 10000 + 0.5);
  const fill = side === "buy" ? rawPricePaise + slip : Math.max(1, rawPricePaise - slip);
  return {
    rawPricePaise: rawPricePaise as Paise,
    slipPaise: slip as Paise,
    fillPricePaise: fill as Paise,
  };
}

export interface FillCosts {
  brokeragePaise: Paise;
  sttPaise: Paise;
  stampPaise: Paise;
  nseTxnPaise: Paise;
  ipftPaise: Paise;
  sebiFeesPaise: Paise;
  gstPaise: Paise;
  totalPaise: Paise;
}

const DENOM_LCM = 1_000_000_000n; // lcm of 1000, 100000, 1000000, 1000000000

function legAmount(turnover: bigint, num: number, den: number): number {
  return roundHalfUp(turnover * BigInt(num), BigInt(den));
}

/**
 * Per-fill delivery statutory costs on integer-paise turnover.
 * Buy leg: brokerage + STT 0.1% + stamp 0.015% + NSE txn + IPFT + SEBI + GST.
 * Sell leg: same without stamp duty. GST is 18% on brokerage + NSE txn +
 * IPFT + SEBI computed from exact pre-rounding amounts and rounded once —
 * the same Model-2 convention as TC-001, referencing the same rate set.
 */
export function calculateFillCosts(
  turnoverPaise: number,
  side: BacktestSide,
  brokeragePaise: number,
): FillCosts {
  if (!Number.isSafeInteger(turnoverPaise) || turnoverPaise < 0) {
    throw new RangeError("turnoverPaise must be a non-negative safe integer.");
  }
  if (!Number.isSafeInteger(brokeragePaise) || brokeragePaise < 0) {
    throw new RangeError("brokeragePaise must be a non-negative safe integer.");
  }
  const turnover = BigInt(turnoverPaise);
  const rates = COST_RATE_SET;

  const stt = side === "buy" ? rates.stt.deliveryBuy : rates.stt.deliverySell;
  const sttPaise = legAmount(turnover, stt.num, stt.den);
  const stampPaise =
    side === "buy"
      ? legAmount(turnover, rates.stamp.deliveryBuy.num, rates.stamp.deliveryBuy.den)
      : 0;
  const nseTxnPaise = legAmount(turnover, rates.nseTxn.num, rates.nseTxn.den);
  const ipftPaise = legAmount(turnover, rates.ipft.num, rates.ipft.den);
  const sebiFeesPaise = legAmount(turnover, rates.sebi.num, rates.sebi.den);

  const scale = (num: number, den: number): bigint => BigInt(num) * (DENOM_LCM / BigInt(den));
  const baseNumer =
    BigInt(brokeragePaise) * DENOM_LCM +
    turnover *
      (scale(rates.nseTxn.num, rates.nseTxn.den) +
        scale(rates.ipft.num, rates.ipft.den) +
        scale(rates.sebi.num, rates.sebi.den));
  const gstPaise = roundHalfUp(
    baseNumer * BigInt(rates.gst.rate.num),
    DENOM_LCM * BigInt(rates.gst.rate.den),
  );

  const total =
    brokeragePaise + sttPaise + stampPaise + nseTxnPaise + ipftPaise + sebiFeesPaise + gstPaise;
  return {
    brokeragePaise: brokeragePaise as Paise,
    sttPaise: sttPaise as Paise,
    stampPaise: stampPaise as Paise,
    nseTxnPaise: nseTxnPaise as Paise,
    ipftPaise: ipftPaise as Paise,
    sebiFeesPaise: sebiFeesPaise as Paise,
    gstPaise: gstPaise as Paise,
    totalPaise: total as Paise,
  };
}

/** Locked rate-set provenance carried on every run result. */
export const BACKTEST_RATE_SET_ID = COST_RATE_SET.id;
