# Calculation Assumptions & Provenance

**Status:** SL-001 (StrikeLens) specified alongside RG-001, TP-001 and TC-001. No other trading calculation is implemented yet.

This document is the single place to record where a formula comes from, what it assumes, and how
it is tested. A calculation must have a record here **before** it ships.

---

## 1. Rules

1. Every calculation gets a stable ID (for example `RG-001`).
2. The definition must be independently derived or based on public mathematics.
3. Proprietary, employer-specific, or reverse-engineered formulas are prohibited.
4. The **Brahmos indicator** must never be implemented or reproduced.
5. Units, rounding, and edge cases are part of the definition, not an afterthought.
6. If a formula changes behaviour, increment its implementation version and note the change.
7. Statutory rates are data, not formulas: they carry an effective date and a source note.
8. A formula without a unit test does not ship.

---

## 2. Required record

| Field                       | Meaning                                                    |
| --------------------------- | ---------------------------------------------------------- |
| **ID**                      | Stable identifier, e.g. `RG-001`                           |
| **Name**                    | Human-readable formula name                                |
| **Tool**                    | Owning tool (RiskGuard, TradeCost, …)                      |
| **Mathematical definition** | Exact expression, with symbols defined                     |
| **Inputs**                  | Name, type, unit, valid range                              |
| **Outputs**                 | Name, type, unit, valid range                              |
| **Assumptions**             | Conditions required for the result to be meaningful        |
| **Units**                   | Paise, basis points, quantity, price, percent, etc.        |
| **Rounding policy**         | Where rounding happens, direction, precision               |
| **Edge cases**              | Zero, negative, missing, boundary, over-limit              |
| **Source / provenance**     | Public reference or "independently derived" with reasoning |
| **Effective date**          | Required for rates and statutory values; otherwise "n/a"   |
| **Implementation version**  | Semantic version of the engine function                    |
| **Tests**                   | Test file and case names                                   |
| **Status**                  | Draft / reviewed / shipped / retired                       |

---

## 3. Unit conventions

| Concept           | Representation                                    | Example            |
| ----------------- | ------------------------------------------------- | ------------------ |
| Money             | Integer **paise** (`Paise`)                       | ₹1,000 = `100_000` |
| Percentage / rate | Integer **basis points** (`BasisPoints`)          | 1% = `100` bps     |
| Price             | Integer paise per unit                            | ₹100.25 = `10_025` |
| Quantity          | Integer units                                     | 200                |
| Lots              | Integer lots                                      | 2                  |
| Lot size          | Integer units per lot                             | 75                 |
| Time              | ISO-8601 string, business day in **Asia/Kolkata** | `2026-10-27`       |

No binary floating-point value is persisted for money. Conversion to a display string happens
only at the UI edge.

---

## 4. Rounding policy (global)

- Convert percentages to paise using integer arithmetic and a single documented rounding step.
- When deriving a position size from a risk budget, round **down** to whole units or lots. Never
  round up: doing so would exceed the stated risk.
- Display rounds to whole rupees for plan prices and to two decimals for prices and charges.
- R:R is displayed to two decimals but computed from unrounded paise values.
- Rounding must be tested at boundaries (for example, a risk budget that is exactly one lot).

Tool-specific deviations must be recorded in the formula entry.

---

## 5. Provenance categories

| Category                                                                   | Allowed?     | Notes                                                      |
| -------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| Public mathematics (arithmetic, ratios, Black–Scholes-style public models) | Yes          | Cite the public definition; implement independently        |
| Independently derived formula                                              | Yes          | Record the derivation and assumptions                      |
| User-defined scoring criteria                                              | Yes          | Belongs to the user; label as user-defined, not predictive |
| Statutory rate schedule                                                    | Yes, as data | Effective date and source note required                    |
| Proprietary indicator / employer material                                  | **No**       | Do not implement, copy, or reverse-engineer                |
| "Best practice" claim without a source                                     | No           | Rewrite as an explicit assumption                          |

---

## 6. Shipped records

### RG-001 — Position size from risk budget

- **Tool:** RiskGuard (`features/risk-guard/risk-guard.ts`, `decidePosition`)
- **Status:** shipped
- **Definition:**
  - `riskBudgetPaise = floor(capitalPaise × riskBps / 10_000)`
  - long: `riskPerUnitPaise = entryPaise − stopPaise`; short: `riskPerUnitPaise = stopPaise − entryPaise`
  - `maxQuantity = floor(riskBudgetPaise / riskPerUnitPaise)`
  - `lots = floor(maxQuantity / lotSize)`; `quantity = lots × lotSize`
  - `usedRiskPaise = quantity × riskPerUnitPaise`
  - with target — long: `reward = targetPaise − entryPaise`; short: `reward = entryPaise − targetPaise`;
    `riskRewardRatio = reward / riskPerUnitPaise`. Without a target, R:R is absent (null), never fabricated.
- **Inputs:**
  - capitalPaise: integer paise, 1 … 100_000_000_000 (₹100 crore)
  - riskBps: integer basis points, 1 … 10_000 (0.01% … 100%)
  - direction: `long` | `short`
  - entryPaise, stopLossPaise: integer paise, > 0
  - lotSize: integer units, 1 … 1_000_000
  - targetPaise: optional integer paise, > 0
- **Outputs:** riskBudgetPaise, riskPerUnitPaise, maxQuantity, lots, quantity, usedRiskPaise,
  unusedRiskPaise, rewardPerUnitPaise | null, riskRewardRatio | null (plain ratio; display only)
- **Assumptions:** direction is explicit; stop is on the loss side of entry; target, if given, is
  on the profit side; brokerage, taxes, charges and slippage are excluded.
- **Units:** paise, basis points, integer quantity, integer lots.
- **Rounding policy:** floor to whole units, then floor to whole lots (never round up — rounding
  up could exceed the stated risk). R:R is computed from unrounded paise values and displayed to
  two decimals. The risk budget is computed exactly with quotient/remainder decomposition
  (`q = floor(capital / 10_000)`, `r = capital % 10_000`,
  `budget = q × bps + floor(r × bps / 10_000)`), so no intermediate product leaves the exact
  integer-safe range for capital up to ₹100 crore.
- **Edge cases:**
  - stop on the wrong side of entry (or equal) → blocked `invalid_stop`
  - risk budget below the cost of one lot → blocked `too_small_for_one_lot` (includes the
    one-paise-short boundary: budget 99_999 against a 100_000 one-lot cost)
  - budget rounding to zero → blocked `invalid_input`
  - target on the wrong side of entry (or equal) → blocked `invalid_target`
  - non-positive or out-of-range input → blocked `invalid_input`
  - blocked results carry the budget, per-unit risk (when known), one-lot cost and max affordable
    quantity so the user sees the maths
- **Source:** independently derived arithmetic; public mathematics only. No proprietary method.
- **Effective date:** n/a (not a statutory rate)
- **Implementation version:** 1.0.0
- **Tests:** `tests/unit/risk-guard.test.ts` (happy paths, boundaries, blocked cases, precision,
  input boundary); `e2e/risk-guard.spec.ts` (allowed flow, blocked flow, axe scan)

### TP-001 — Trade-plan coherence check

- **Tool:** TradePlan (`features/trade-plan/trade-plan.ts`, `checkPlan`)
- **Status:** shipped
- **Definition:**
  - long: `riskPerUnitPaise = entryPaise − stopPaise`; short: `riskPerUnitPaise = stopPaise − entryPaise`
  - with target — long: `reward = targetPaise − entryPaise`; short: `reward = entryPaise − targetPaise`;
    `riskRewardRatio = reward / riskPerUnitPaise`. Without a target, R:R is absent (null), never fabricated.
- **Inputs:**
  - direction: `long` | `short`
  - entryPaise, stopLossPaise: integer paise, > 0
  - targetPaise: optional integer paise, > 0
  - setupName: text, 1 … 80 characters; thesis: text, 1 … 500 characters;
    invalidation: text, 1 … 280 characters; notes: optional text, ≤ 500 characters
- **Outputs:** riskPerUnitPaise, rewardPerUnitPaise | null, riskRewardRatio | null (plain ratio;
  display only), plus the plan text echoed for the receipt
- **Assumptions:** direction is explicit; stop must be on the loss side of entry; target, if
  given, must be on the profit side; brokerage, taxes, charges and slippage are excluded. The
  setup, thesis and invalidation are the user's own words — the tool checks coherence, not quality.
- **Units:** paise for all money; plain ratio for R:R.
- **Rounding policy:** no rounding — integer-paise subtraction is exact. R:R is computed from
  unrounded paise values and displayed to two decimals.
- **Edge cases:**
  - stop on the wrong side of entry (or equal) → incoherent `invalid_stop`; direction is never
    silently corrected
  - target on the wrong side of entry (or equal) → incoherent `invalid_target` (the valid
    per-unit risk is still reported so the user sees the maths)
  - missing target → coherent without reward/R:R, explicitly labelled "not calculated"
  - non-positive prices, empty setup/thesis/invalidation, or over-length text → incoherent
    `invalid_input` (length/shape enforced at the Zod boundary first)
- **Source:** independently derived arithmetic; public mathematics only. No proprietary method.
- **Effective date:** n/a (not a statutory rate)
- **Implementation version:** 1.0.0
- **Tests:** `tests/unit/trade-plan.test.ts` (direction, stop, target, arithmetic, precision,
  receipt, boundary); `e2e/trade-plan.spec.ts` (coherent flow, incoherent flow, axe scan)

### TC-001 — Transaction cost estimate and breakeven

- **Tool:** TradeCost (`features/trade-cost/trade-cost.ts`, `calculateCosts`)
- **Status:** shipped
- **Definition:**
  - legs — long: `buyPrice = entryPaise`, `sellPrice = exitPaise`; short: `sellPrice = entryPaise`, `buyPrice = exitPaise`
  - `turnoverBuy = buyPrice × quantity`; `turnoverSell = sellPrice × quantity`
  - `grossPnl = turnoverSell − turnoverBuy` (both directions; legs are direction-mapped)
  - per side: `stt` (delivery 1/1000 both sides; intraday 25/1_000_000 sell only),
    `nseTxn` 30699/1_000_000_000 (₹306.99/crore), `ipft` 1/1_000_000_000 (₹0.01/crore),
    `stamp` buy only (delivery 15/100_000; intraday 3/100_000), `sebi` 1/1_000_000
  - each leg-side line = `roundHalfUp(turnover × num/den)`, exact integer arithmetic, ties up
  - `gst = roundHalfUp((brokerage + exact NSE txn + exact IPFT + exact SEBI) × 18/100)` — Model 2:
    one rounding on exact pre-rounding amounts, never on rounded lines
  - `totalCharges = brokerage + stt + nseTxn + ipft + stamp + sebi + gst`
  - `netPnl = grossPnl − totalCharges`; `costToGrossRatio = total/gross` (display only, null when gross ≤ 0)
  - breakeven — long: smallest exit price with net ≥ 0; short: largest cover price
    with net ≥ 0. Exact-root integer binary search on the exact (unrounded) net sign,
    then exhaustive verification of the real rounded engine over [root−3, root+3]
    (derived bound: 5 exit-varying lines × ±0.5 paise vs. ≥ ~1 paise/step exact slope).
    Unreachable within the allowed domain → `breakeven_unreachable`, never a guess.
- **Inputs:**
  - direction: `long` | `short`
  - mode: `delivery` | `intraday`
  - entryPaise, exitPaise: integer paise, 1 … 100_000_000_000 (₹100 crore)
  - quantity: integer shares, 1 … 1_000_000, plus a turnover guard (each leg price × quantity
    must stay within `Number.MAX_SAFE_INTEGER`, checked via division)
  - brokeragePaise: integer paise, 0 … 100_000_000_000 — round-trip total, explicitly
    supplied; blank is rejected, 0 is accepted and never implied
- **Outputs:** turnoverBuy/Sell, grossPnl, seven charge lines, totalCharges, netPnl,
  costToGrossRatio | null, breakeven (ok price + residual | unreachable), verdict,
  rounding + rate-set provenance
- **Assumptions:** NSE cash market only (rate set `nse-cash-2026-03-01`, effective 1-Mar-2026);
  retail short sales settle intraday (short + delivery → `short_delivery_unsupported`);
  brokerage is the user's own assumption; IPFT is included in the GST base as an estimator
  assumption following broker contract-note evidence (Zerodha lists IPFT "₹0.01 per crore + GST";
  broker-specific treatment can differ, so the result stays an estimate); per-leg half-up
  rounding is an estimator assumption; DP charges, slippage, penalties and account fees are excluded.
- **Units:** paise, integer shares, plain ratio for cost-to-gross (display only).
- **Rounding policy:** one half-up rounding per charge leg-side line (ties up); GST rounded
  once on the exact taxable base (no double rounding). Receipt lines may foot a few paise
  away from the GST base; the receipt states why.
- **Edge cases:**
  - short + delivery → `unsupported` (`short_delivery_unsupported`)
  - gross ≤ 0 → ratio suppressed; verdict states costs on a loss plainly
  - costs exceed gross → computed with an exceed-verdict; breakeven still reported
  - breakeven unreachable within the domain → `unreachable` with a reason
  - non-positive or out-of-range input, turnover beyond the exact range → `invalid_input`
- **Source:** independently derived arithmetic on the versioned rate set
  (`config/cost-rates.ts`); NSE Circular NSE/FA/73061 (27-Feb-2026, eff. 1-Mar-2026);
  Finance Act STT schedule; Indian Stamp Act as amended 2020; SEBI fee schedule; CBIC GST.
- **Effective date:** 2026-03-01 (rate set)
- **Implementation version:** 1.0.0
- **Tests:** `tests/unit/trade-cost.test.ts` (domain, rates, precision, GST footing, breakeven,
  boundary, handoff, provenance); `tests/components/trade-cost.test.tsx` (estimate, receipt,
  handoff, unsupported); `e2e/trade-cost.spec.ts` (estimate flow, handoff flow, axe scan)

### SL-001 — Option strike comparison

- **Tool:** StrikeLens (`features/strike-lens/strike-lens.ts`, `compareStrikes`)
- **Status:** shipped
- **Definition:**
  - one comparison set: one spot price, one option type (`call` | `put`), 1–5 unique strikes each
    with a premium; rows are returned in ascending strike order
  - moneyness — call: `spot > strike` → ITM, `spot < strike` → OTM, `spot == strike` → ATM;
    put: `strike > spot` → ITM, `strike < spot` → OTM, `strike == spot` → ATM. Exact paise
    equality only; no tolerance, no nearest-strike ATM
  - intrinsic — call: `max(spot − strike, 0)`; put: `max(strike − spot, 0)`
  - extrinsic — `premium − intrinsic` when `premium >= intrinsic`; otherwise the row is
    `inconsistent` and extrinsic is absent (null), never negative, never clamped to zero
  - signed distance: `strike − spot` (negative means the strike is below spot);
    `absDistance = |distance|`
  - percentage distance (display only): integer basis points
    `roundHalfUp(|distance| × 10_000 / spot)` via quotient/remainder decomposition (half-up on
    the exact remainder); displayed as `(bps / 100).toFixed(2)%`
  - option breakeven before transaction costs (long, expiry) — call: `strike + premium`;
    put: `strike − premium`. A breakeven ≤ 0 (reachable on a deep-ITM put whose premium covers
    the strike) is displayed with a factual note, never blocked
  - nearest-to-spot flag: the row with minimum `|distance|`; ties resolve to the lower strike
    (deterministic because rows are strike-ordered before selection). Labelled "Nearest to
    spot", never ATM
- **Inputs:**
  - spotPaise: integer paise, 1 … 100_000_000_000 (₹100 crore)
  - optionType: `call` | `put` (displayed CE / PE); one type per comparison, never mixed
  - rows: 1 … 5 × { strikePaise: integer paise, 1 … 100_000_000_000; premiumPaise: integer paise,
    1 … 100_000_000_000 }; strikes unique within the set
  - expiryLabel: optional free text, ≤ 30 characters; display/provenance only, never calculated
- **Outputs:** per row — moneyness, intrinsicPaise, extrinsicPaise | null, signed/absolute
  distancePaise, distanceBps, breakevenPaise, breakevenAtOrBelowZero flag, isNearestToSpot flag,
  plus `inconsistent` status + reason when `premium < intrinsic`
- **Assumptions:** long positions only; expiry payoff; transaction costs, STT on options,
  slippage and time decay excluded; short-option breakeven out of scope; the inputs are the
  user's own numbers, not verified market data
- **Units:** paise for all money; plain ITM/ATM/OTM labels; integer basis points for percentage
  distance (display only)
- **Rounding policy:** no rounding — exact integer-paise arithmetic; percentage shown to two
  decimals from integer basis points
- **Edge cases:**
  - `premium < intrinsic` → row-level `inconsistent` (warn, not fatal); remaining row fields
    still reported
  - PE breakeven ≤ 0 → shown with the note "breakeven at or below zero — premium covers the
    full strike"
  - non-positive/over-cap spot, strike or premium, unknown option type, empty or oversized row
    set, duplicate strikes → `invalid` (`invalid_input`)
- **Source:** independently derived arithmetic on public textbook definitions (intrinsic as
  `max(spot − strike, 0)` / `max(strike − spot, 0)`, premium = intrinsic + extrinsic, long
  breakeven `strike ± premium`). No proprietary method, no pricing model, no Greeks, no IV.
- **Effective date:** n/a (not a statutory rate)
- **Implementation version:** 1.0.0
- **Tests:** `tests/unit/strike-lens.test.ts` (moneyness incl. ±1 paise ATM boundaries,
  nearest incl. ties, intrinsic/extrinsic, inconsistent, breakeven incl. ≤ 0, distance, bps
  half-up, parsing, caps, duplicates, ordering, handoff); `tests/components/strike-lens.test.tsx`
  (empty state, rows, warnings, receipt, type switch, handoff prefill);
  `e2e/strike-lens.spec.ts` (flows, prefill, axe scan)

---

## 7. Statutory rate data (TradeCost)

Rates such as STT, exchange transaction charges, SEBI fees, stamp duty, GST, and DP charges
change. They will live in `config/cost-rates.ts` as versioned records:

```ts
type CostRateSet = {
  id: string;
  effectiveFrom: string; // ISO date
  sourceNote: string;
  segmentRates: Record<string, number>; // basis points or paise, per field
};
```

The UI must show the effective date and state that charges are an estimate to verify with the
broker. A rate change is a data change, not a formula change.

---

## 8. Change control

1. Add or update the record.
2. Add table-driven unit tests with hand-computed expected values.
3. Update the implementation version.
4. Note the change in the tool's changelog or ADR if behaviour changes materially.
5. Re-run the copy/compliance checklist for any user-facing wording change.

---

## 9. Implemented calculations

- RG-001 — Position size from risk budget (RiskGuard, v1.0.0, shipped). See §6.
- TP-001 — Trade-plan coherence check (TradePlan, v1.0.0, shipped). See §6.
- TC-001 — Transaction cost estimate and breakeven (TradeCost, v1.0.0, shipped). See §6.
- SL-001 — Option strike comparison (StrikeLens, v1.0.0, shipped). See §6.
