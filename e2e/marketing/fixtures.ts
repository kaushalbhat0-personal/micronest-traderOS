/**
 * Single source of truth for marketing screenshot inputs (UI-6B).
 *
 * Synthetic, obviously illustrative values only — never market, customer, or
 * employer data. These fixtures drive the real product UI; they never
 * reimplement tool math. Capture states were approved in the UI-6A audit
 * against the production deployment.
 */

export type MarketingStep =
  | { kind: "fill"; label: RegExp; value: string }
  | { kind: "fillNth"; label: RegExp; index: number; value: string }
  | { kind: "checkRadio"; name: RegExp }
  | { kind: "clickButton"; name: RegExp };

export type MarketingCapture = { kind: "grid" } | { kind: "greekMapHero" };

export interface MarketingFixture {
  tool: "risk-guard" | "trade-plan" | "trade-cost" | "strike-lens" | "greek-map";
  route: string;
  steps: readonly MarketingStep[];
  /** Key result text that must be visible before capture. */
  waits: readonly RegExp[];
  capture: MarketingCapture;
  /** aria-labelledby of the result section anchoring the capture target. */
  resultSection: string;
}

export const MARKETING_FIXTURES: readonly MarketingFixture[] = [
  {
    tool: "risk-guard",
    route: "/tools/risk-guard",
    steps: [
      { kind: "fill", label: /capital/i, value: "100000" },
      { kind: "fill", label: /risk/i, value: "1" },
      { kind: "checkRadio", name: /^long$/i },
      { kind: "fill", label: /entry/i, value: "100" },
      { kind: "fill", label: /stop/i, value: "95" },
      { kind: "fill", label: /lot size/i, value: "1" },
      { kind: "fill", label: /target/i, value: "110" },
      { kind: "clickButton", name: /calculate position size/i },
    ],
    waits: [/allowed quantity/i, /calculation receipt/i, /RG-001/],
    capture: { kind: "grid" },
    resultSection: "risk-guard-result-heading",
  },
  {
    tool: "trade-plan",
    route: "/tools/trade-plan",
    steps: [
      { kind: "checkRadio", name: /^long$/i },
      { kind: "fill", label: /setup name/i, value: "Breakout retest" },
      { kind: "fill", label: /thesis/i, value: "Price reclaimed the level and held on retest." },
      {
        kind: "fill",
        label: /invalidation/i,
        value: "A close back below the level voids the idea.",
      },
      { kind: "fill", label: /entry/i, value: "100" },
      { kind: "fill", label: /stop/i, value: "95" },
      { kind: "fill", label: /target/i, value: "110" },
      { kind: "clickButton", name: /check my plan/i },
    ],
    waits: [/coherent plan/i, /plan receipt/i, /TP-001/],
    capture: { kind: "grid" },
    resultSection: "trade-plan-result-heading",
  },
  {
    tool: "trade-cost",
    route: "/tools/trade-cost",
    steps: [
      { kind: "checkRadio", name: /^long$/i },
      { kind: "checkRadio", name: /^delivery$/i },
      { kind: "fill", label: /buy price/i, value: "100" },
      { kind: "fill", label: /sell price/i, value: "110" },
      { kind: "fill", label: /quantity/i, value: "200" },
      { kind: "fill", label: /brokerage/i, value: "40" },
      { kind: "clickButton", name: /estimate transaction costs/i },
    ],
    waits: [/survives costs/i, /calculation receipt/i, /TC-001/],
    capture: { kind: "grid" },
    resultSection: "trade-cost-result-heading",
  },
  {
    tool: "strike-lens",
    route: "/tools/strike-lens",
    steps: [
      { kind: "checkRadio", name: /ce \(call\)/i },
      { kind: "fill", label: /spot/i, value: "100" },
      { kind: "fillNth", label: /^strike/i, index: 0, value: "95" },
      { kind: "fillNth", label: /premium/i, index: 0, value: "8" },
      { kind: "clickButton", name: /add strike/i },
      { kind: "fillNth", label: /^strike/i, index: 1, value: "105" },
      { kind: "fillNth", label: /premium/i, index: 1, value: "3" },
      { kind: "clickButton", name: /compare strikes/i },
    ],
    waits: [/compared 2 strikes/i, /nearest to spot/i, /SL-001/],
    capture: { kind: "grid" },
    resultSection: "strike-lens-result-heading",
  },
  {
    tool: "greek-map",
    route: "/tools/greek-map",
    steps: [
      { kind: "checkRadio", name: /ce \(call\)/i },
      { kind: "fill", label: /spot/i, value: "100" },
      { kind: "fill", label: /strike/i, value: "100" },
      { kind: "fill", label: /days to expiry/i, value: "30" },
      { kind: "fill", label: /volatility/i, value: "20" },
      { kind: "fill", label: /risk-free/i, value: "6" },
      { kind: "fill", label: /dividend/i, value: "0" },
      { kind: "fill", label: /your premium/i, value: "8" },
      { kind: "clickButton", name: /calculate model/i },
    ],
    waits: [/model calculated/i, /not a mispricing signal/i, /GM-001/],
    capture: { kind: "greekMapHero" },
    resultSection: "greek-map-result-heading",
  },
] as const;
