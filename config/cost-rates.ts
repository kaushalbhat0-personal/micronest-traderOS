/**
 * Versioned transaction-cost rate data for TradeCost (TC-001).
 *
 * This file is DATA, not business logic: a rate change is a data change, not
 * a formula change. Rates are exact rational fractions ({ num, den }) so the
 * domain engine never touches binary floating-point. Every rate carries a
 * human-readable source note with its effective date.
 */

export type RateFraction = {
  /** Exact numerator of the rate. */
  num: number;
  /** Exact denominator of the rate. */
  den: number;
};

export type GstBaseMember = "brokerage" | "nseTxn" | "sebiFees";

export type CostRateSet = {
  id: string;
  jurisdiction: string;
  exchange: string;
  market: string;
  /** ISO date from which this set applies. TradeCost always uses the active set. */
  effectiveFrom: string;
  stt: {
    deliveryBuy: RateFraction;
    deliverySell: RateFraction;
    intradayBuy: RateFraction;
    intradaySell: RateFraction;
  };
  stamp: {
    deliveryBuy: RateFraction;
    intradayBuy: RateFraction;
  };
  /** NSE cash-market transaction charge, per side. */
  nseTxn: RateFraction;
  /** NSE Investor Protection Fund Trust contribution, per side. */
  ipft: RateFraction;
  /** SEBI turnover fee, per side. */
  sebi: RateFraction;
  gst: {
    rate: RateFraction;
    /**
     * Estimator assumption (see sourceNotes.gstBase): which components enter
     * the GST base. IPFT is deliberately absent pending contract-note
     * confirmation. STT and stamp duty are statutory levies, never in the base.
     */
    base: readonly GstBaseMember[];
  };
  /** Rounding convention (estimator assumption, documented on the receipt). */
  roundingNote: string;
  sourceNotes: Record<string, string>;
};

export const COST_RATE_SET: CostRateSet = {
  id: "nse-cash-2026-03-01",
  jurisdiction: "IN",
  exchange: "NSE",
  market: "cash",
  effectiveFrom: "2026-03-01",
  stt: {
    deliveryBuy: { num: 1, den: 1000 }, // 0.1%
    deliverySell: { num: 1, den: 1000 }, // 0.1%
    intradayBuy: { num: 0, den: 1 }, // no STT on intraday buy
    intradaySell: { num: 25, den: 1_000_000 }, // 0.025%
  },
  stamp: {
    deliveryBuy: { num: 15, den: 100_000 }, // 0.015%
    intradayBuy: { num: 3, den: 100_000 }, // 0.003%
  },
  nseTxn: { num: 30_699, den: 1_000_000_000 }, // ₹306.99/crore/side
  ipft: { num: 1, den: 1_000_000_000 }, // ₹0.01/crore/side
  sebi: { num: 1, den: 1_000_000 }, // ₹10/crore/side
  gst: {
    rate: { num: 18, den: 100 }, // 18%
    base: ["brokerage", "nseTxn", "sebiFees"],
  },
  roundingNote:
    "Half-up to paise per charge leg; GST computed on exact pre-rounding taxable amounts and rounded once. Estimator assumption — verify against your broker's contract note.",
  sourceNotes: {
    nseTxn:
      "NSE Circular NSE/FA/73061 dated 27-Feb-2026, effective 1-Mar-2026: cash-market transaction charge ₹306.99/crore/side.",
    ipft: "NSE Circular NSE/FA/73061 dated 27-Feb-2026, effective 1-Mar-2026: IPFT contribution ₹0.01/crore/side (combined ₹307/crore/side with transaction charge).",
    stt: "Finance Act STT schedule (Income Tax Department): equity delivery 0.1% on purchase and sale; equity intraday 0.025% on sale.",
    stamp:
      "Indian Stamp Act as amended 2020 (uniform levy from 1-Jul-2020): delivery transfer 0.015% on buy; non-delivery transfer 0.003% on buy.",
    sebi: "Current SEBI fee schedule: ₹10 per crore of cash-market turnover, per side.",
    gstBase:
      "CBIC: stock-broking is a taxable service (18%); pure-agent recoveries may fall outside taxable value. GST base (brokerage + NSE txn + SEBI; IPFT excluded) is an estimator assumption pending contract-note confirmation — verify.",
  },
};
