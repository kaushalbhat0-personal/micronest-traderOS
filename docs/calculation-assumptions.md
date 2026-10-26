# Calculation Assumptions & Provenance

**Status:** Phase 3 — RG-001 (RiskGuard) and TP-001 (TradePlan) shipped. No other trading calculation is implemented yet.

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
  - capitalPaise: integer paise, 1 … 1_000_000_000_000 (₹100 crore)
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
  two decimals.
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
