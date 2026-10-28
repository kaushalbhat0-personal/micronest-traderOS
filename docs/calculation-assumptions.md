# Calculation Assumptions & Provenance

**Status:** SL-001 (StrikeLens) and GM-001 (GreekMap) specified alongside RG-001, TP-001 and TC-001, plus SLAB-DATA-001 (Strategy Lab dataset boundary) and SLAB-STRAT-001 (Strategy Lab reference strategy). No other trading calculation is implemented yet.

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

### GM-001 — Single-option BSM-Merton price and Greeks with fixed scenarios

- **Tool:** GreekMap (`features/greek-map/greek-map.ts`, `analyzeGreekMap`)
- **Status:** shipped
- **Definition:**
  - Black-Scholes-Merton with continuous dividend yield, European exercise, one call or put:
    `C = S·e^(−qT)·N(d1) − K·e^(−rT)·N(d2)`,
    `P = K·e^(−rT)·N(−d2) − S·e^(−qT)·N(−d1)`,
    `d1 = [ln(S/K) + (r−q+σ²/2)T] / (σ√T)`, `d2 = d1 − σ√T`, `T = DTE / 365`
    (S, K in rupees converted from integer paise; σ, r, q as annual decimals)
  - normal CDF N(x) via the Abramowitz–Stegun 7.1.26 erf approximation
    (`N(x) = ½(1 + sign·erf(|x|/√2))`, `p = 0.3275911`); documented error bound ≤ 1.5e-7
  - Greeks — call delta `e^(−qT)·N(d1)`; put delta `e^(−qT)·(N(d1)−1)` (per ₹1, 4dp);
    gamma `e^(−qT)·φ(d1) / (S·σ·√T)`, same for call and put (per ₹1, 6dp);
    theta `−∂V/∂T ÷ 365` in ₹ per calendar day (2dp; Hull-sign convention, so a
    deep-ITM put can print a positive theta); vega `S·e^(−qT)·φ(d1)·√T ÷ 100`
    in ₹ per 1pp IV (2dp, same for call and put); rho call `K·T·e^(−rT)·N(d2) ÷ 100`,
    put `−K·T·e^(−rT)·N(−d2) ÷ 100` in ₹ per 1pp rate (2dp)
  - fixed spot scenarios −10/−5/0/+5/+10% on S (K, DTE, σ, r, q held constant),
    each replaying price, delta, gamma, theta/day and vega; the 0% row repeats
    the base point and is badged "Your inputs"
  - fixed time scenarios −1/−3/−7 days on DTE (spot, σ, r, q held constant),
    each replaying price and theta/day; a row whose DTE would fall under 1 is
    omitted with the note "omitted — V1 has a 1-day DTE floor", never clamped to 1
  - optional user premium (integer paise) is used only for an arithmetic comparison
    (`your premium − model value` in exact paise), shown subordinate to the Greeks
    with the wording "Arithmetic difference only — not a mispricing signal."
  - a premium under intrinsic value (`max(spot−strike,0)` call / `max(strike−spot,0)`
    put, exact paise) raises an informational warning and the model still calculates;
    a premium outside the European arbitrage bounds
    (call `[max(S·e^−qT − K·e^−rT, 0), S·e^−qT]`,
    put `[max(K·e^−rT − S·e^−qT, 0), K·e^−rT]`, half-a-paise tolerance) raises the
    warning "Premium is outside the European arbitrage bounds for the supplied inputs.
    No single IV reproduces this premium under BSM." There is no IV solver.
- **Inputs:**
  - optionType: `call` | `put` (displayed CE / PE)
  - spotPaise, strikePaise: integer paise, 1 … 100_000_000_000 (₹100 crore)
  - dteDays: calendar days, 1 … 730, up to 2 decimals — shape and range decided on
    the exact decimal string via scaled-integer comparison, never on an IEEE parse
  - volatility: 0.1% … 500% per year; rate: 0% … 20% per year; dividend yield:
    0% … 15% per year — percents typed by the user, boundary decided on the exact
    scaled integer (units of 0.0001%); no defaults, but an explicit 0 is accepted
    for rate and dividend yield; the engine receives IEEE values after the boundary passes
  - premiumPaise: optional integer paise, 1 … 100_000_000_000 when present
  - expiryLabel: optional free text, ≤ 30 characters; display/provenance only, never calculated
- **Outputs:** base model value (half-up to paise) plus five Greeks; intrinsicPaise;
  five spot rows (price, delta, gamma, theta/day, vega, isBase flag); three time rows
  (price, theta/day) or omission markers; comparison (your premium, model value,
  signed paise difference) or null; warning list; GM-001 receipt
- **Assumptions:** European exercise at expiry only; constant σ/r/q; lognormal prices
  (geometric Brownian motion); continuous compounding; frictionless (no costs, taxes,
  spreads, liquidity limits); discrete dividends, American exercise and smiles/skews
  are outside the model; inputs are the user's own assumptions, unverified and not real-time
- **Units:** paise for money (half-up display); per-₹1 delta/gamma; ₹/calendar-day theta;
  ₹/1pp-IV vega; ₹/1pp-rate rho
- **Rounding policy:** model value rounded half-up to paise for display; Greeks shown at
  fixed decimals (4/6/2/2/2dp); scenario spot rounded half-up to paise for display while
  the maths uses full precision; the arbitrage check tolerates half a paise so float dust
  never warns on a boundary premium
- **Edge cases:**
  - out-of-range or non-positive money/DTE/vol/rate/dividend, unknown option type, or
    any non-finite intermediate/result → blocked `invalid_input` (NaN/Infinity never
    reaches the UI, nothing is clamped)
  - premium under intrinsic or outside the arbitrage bounds → informational warning,
    calculation continues, comparison still shown
  - time rows under the 1-day floor → omitted with a factual note, never clamped
- **Source:** public textbook mathematics (Black–Scholes–Merton with continuous yield;
  Abramowitz–Stegun 7.1.26); implemented independently. Reference values in tests were
  produced from the same closed form with an independent Simpson-rule erf implementation,
  including the standard one-year ATM fixture (call ≈ ₹10.4506). No proprietary method.
- **Effective date:** n/a (not a statutory rate)
- **Implementation version:** 1.0.0
- **Tests:** `tests/unit/greek-map.test.ts` (CDF values/symmetry/tails, d1/d2, golden
  call/put/ATM/ITM/OTM/dividend fixtures, Greek signs and conventions incl. positive
  deep-ITM put theta, put-call parity, q=0 reduction, determinism, analytic-vs-FD
  cross-checks, DTE/vol/rate/dividend boundaries incl. exact-string policy, cap-scale,
  non-finite protection, display rounding, premium warnings, scenario rows and floor
  omission, handoff allowlist); `tests/components/greek-map.test.tsx` (empty state,
  call/put, type switch, comparison, warnings, blocked input, scenarios, omission,
  receipt, forbidden-copy scan, handoff prefill, 360px labels, a11y labels);
  `e2e/greek-map.spec.ts` (route, call/put, Greeks, scenarios, floor, comparison,
  blocked input, warnings, receipt, handoff prefill/editability, unknown-key and
  narrative rejection, axe, 360/390/768/1280, reduced motion, touch targets, overflow)
- **Model-vs-NSE distinction:** the receipt states "MicroNest model:
  Black-Scholes-Merton with continuous dividend yield" and "This is a user-assumption
  model illustration and is not an NSE settlement or exchange pricing calculation."
  The model value is not a prediction; scenarios are not forecasts. Not investment advice.

### SLAB-STRAT-001 — SMA cross with N-bar-low stop

- **Tool:** Strategy Lab (`features/strategy-lab/strategies/sma-cross.ts`, `evaluateSmaCross`;
  contracts in `features/strategy-lab/strategy.ts`)
- **Status:** shipped (M1-B)
- **Definition:**
  - averages use close prices; comparisons use exact integer cross-products over
    BigInt sums — `fastAvg > slowAvg ⟺ fastSum × slowPeriod > slowSum × fastPeriod`.
    No division, no floating point.
  - entry (FLAT only): previous relation `≤ 0` (fast at or below slow) and current
    relation `> 0` at the close of the last supplied bar. Strict cross only —
    sustained leadership never re-triggers.
  - exit (LONG only): previous relation `≥ 0` and current relation `< 0`.
  - `stopPaise` = lowest `lowPaise` of the last `stopLookback` bars including the
    signal bar. Proposed as-is: never clamped, never moved; protectiveness
    relative to the actual fill is an M1-C execution rule, not a strategy rule.
  - `targetPaise` is always null for SLAB-STRAT-001; exits are cross-driven.
- **Inputs:** `bars` (visible window `0..t` only), `position` (flat/long view),
  `params` (`fastPeriod: 10`, `slowPeriod: 30`, `stopLookback: 20`, `minBars: 30`).
- **Outputs:** `no-signal` | `entry { direction: "long", stopPaise, targetPaise: null, note }`
  | `exit { note }`. Notes are factual trace labels (≤ 140 chars), never advice.
- **Assumptions:** long-only; delivery daily-bar research; fewer than `minBars`
  bars (or insufficient cross history) yields `no-signal`, never a fabricated
  decision; next-bar execution and stop-vs-fill handling belong to M1-C.
- **Units:** paise for all money; integer bar counts; plain relations (-1/0/1).
- **Rounding policy:** none — integer sums, products, and comparisons are exact.
- **Edge cases:**
  - warm-up (`bars.length < minBars`) → `no-signal`
  - insufficient cross history at `t-1` → `no-signal`
  - insufficient stop window → `no-signal` (no stop is proposed, not a weak one)
  - stop at/above the signal close → proposed unchanged (M1-C decides validity)
  - invalid params → `no-signal`; strict validation lives at the boundary
    (`0 < fast < slow`, `stopLookback ≥ 1`, `minBars ≥ slow`)
  - LONG ignores entry crosses; FLAT ignores exit crosses; no pyramiding, no reversal
- **Source:** independently derived from the public textbook definition of the
  simple moving average and the standard strict-crossover rule. No employer
  material, no proprietary method, no Brahmos logic.
- **Effective date:** n/a (not a statutory rate)
- **Implementation version:** 1.0.0
- **Tests:** `tests/unit/strategy-lab-strategy.test.ts` (cross-product exactness
  incl. product-scale values, strict entry/exit, equality transitions, no-repeat
  behavior, warm-up gates, stop window/min/current-bar/unchanged-stop semantics,
  position gating, param validation, determinism, note length/language,
  anti-lookahead window identity)
- **Limitations:** a signal on a research fixture is a historical-simulation
  input, not a recommendation. The strategy has no notion of costs, slippage,
  liquidity, or risk — those belong to later M1 phases. Not investment advice,
  not a prediction.

### SLAB-EXEC-001 — Deterministic next-open backtester

- **Tool:** Strategy Lab (`features/strategy-lab/backtester.ts`, `runBacktest`)
- **Status:** shipped (M1-C)
- **Definition:**
  - per close `t`: strategy observes `bars[0..t]` (fresh slice) with a
    flat/long position view; signals schedule for bar `t+1`
  - entries fill at next-bar open; the proposed stop/target become pending
    protective levels; a stop `>=` the actual slipped entry fill rejects the
    entry as `non-protective-stop` (diagnostic, never a trade, never repaired)
  - protective checks on every held bar, stop-first: open `<= S` → stop fills
    at the open; open `>= T` → target fills at the open; else low `<= S` →
    stop fills at `S`; else high `>= T` → target fills at `T`
  - entry bars run the same protective checks, so fill-then-stop on one bar
    is representable; protective exits outrank pending signal exits, which
    fill at the open only when no protective exit occurred
  - no next bar after a signal → entry dropped (`signalsUnexecutedAtEnd`),
    exit left to the final rule; any position open after the final bar exits
    at the final close (`forced-final`, slipped and costed like any sell)
- **Inputs:** validated `bars`, strategy `evaluate`, validated params, fixed
  `quantity` (1 … 1_000_000), `slippageBps` (0 | 5 | 10), `brokeragePaise`
  (≥ 0; locked fixture 2000). Structurally invalid runs return `invalid`.
- **Outputs:** frozen `trades` (entry/exit dates, raw + slipped fills per
  leg, per-leg slippage, buy/sell statutory splits, slipped-fill gross,
  net, reason, forced flag), frozen `rejectedEntries`, frozen diagnostics.
- **Assumptions:** long-only, one position, fixed quantity, delivery
  daily-bar research; OHLC-only data cannot reveal intrabar order, so
  same-bar stop+target resolves stop-first by deliberate pessimism.
- **Units:** paise for all money; integer quantities and basis points.
- **Rounding policy:** slippage `roundHalfUp(raw × bps / 10000)` per fill;
  sell fills floored at 1 paise; P&L via exact integer (BigInt) arithmetic.
- **Edge cases:** empty/unsorted bars, bad quantity/slippage/brokerage/params
  → `invalid`; stop gap-through at entry → rejected entry, never a fill;
  final-bar signal → counted unexecuted, never fabricated.
- **Source:** independently derived from the locked M1 execution contract.
  No employer material, no proprietary method, no Brahmos logic.
- **Effective date:** n/a (not a statutory rate)
- **Implementation version:** 1.0.0
- **Tests:** `tests/unit/strategy-lab-backtester.test.ts` (next-open entry,
  final-bar drop, all four gap/intrabar fills, stop-first conflict, entry-bar
  hold/reject/same-bar-stop, signal-exit timing and priority, forced-final
  with sell slippage, slippage rounding and floor, locked hand-calculated
  accounting incl. GST-base assertion, determinism, input validation,
  window-identity anti-leakage, real-strategy fixture integration)
- **Limitations:** a research/backtesting model, not a live execution
  guarantee. No partial fills, no volume gating, no corporate-action
  handling beyond the dataset contract, no order-queue realism. Fills at the
  printed open are an assumption, not a promise. Not investment advice,
  not a prediction.

### SLAB-COST-001 — Per-fill delivery cost and slippage pricer

- **Tool:** Strategy Lab (`features/strategy-lab/costs.ts`, `applySlippage`
  - `calculateFillCosts`)
- **Status:** shipped (M1-C)
- **Definition:**
  - slippage: buys `raw + roundHalfUp(raw × bps/10000)`, sells mirrored
    with a 1-paise floor; the slipped price is the fill price, deducted
    nowhere else
  - delivery legs on integer-paise turnover: buy = brokerage + STT 0.1% +
    stamp 0.015% + NSE txn ₹306.99/cr + IPFT ₹0.01/cr + SEBI ₹10/cr + 18%
    GST on (brokerage + NSE txn + IPFT + SEBI); sell = same without stamp
  - each leg half-up to paise; GST on exact pre-rounding taxable amounts,
    rounded once (Model-2, same convention as TC-001, same rate data)
  - trade economics: `gross = (exitFill − entryFill) × qty` (slipped fills),
    `net = gross − (buyStatutory + sellStatutory)`; per-leg slippage is a
    reporting diagnostic satisfying `grossBeforeSlip − gross = slippage`
- **Inputs:** integer-paise turnover/prices, side, brokerage, slippage bps.
- **Outputs:** per-leg charge split with total; slipped fill triple.
- **Assumptions:** rates from `COST_RATE_SET nse-cash-2026-03-01` (single
  rate source, read as data); DP charges, penalties, account fees excluded
  and disclosed; ₹20 flat brokerage is a research assumption, not a broker quote.
- **Units:** paise; basis points for slippage.
- **Rounding policy:** half-up per leg; GST once on exact amounts.
- **Edge cases:** zero brokerage/slippage valid (diagnostics); non-integer or
  negative inputs throw (programmer preconditions, never run-validated data).
- **Source:** rate data from `config/cost-rates.ts` provenance; arithmetic
  independently implemented for the lab boundary (no import from TradeCost).
- **Effective date:** follows the referenced rate set (`2026-03-01`).
- **Implementation version:** 1.0.0
- **Tests:** `tests/unit/strategy-lab-backtester.test.ts` (slippage legs,
  rounding, floor, hand-calculated 989/4743/−3754 trade, GST-base check)
- **Limitations:** estimator, not a contract-note replica — verify against
  the broker's note. Not investment advice.

### SLAB-SENS-001 — Execution-cost sensitivity harness

- **Tool:** Strategy Lab (`features/strategy-lab/sensitivity.ts`, `runSensitivity`)
- **Status:** shipped (M1-D)
- **Definition:** runs the frozen M1-C backtest three times over identical
  inputs (bars, strategy, params, quantity, brokerage), varying only
  `slippageBps` across the locked legs 0, 5, 10 — returned as a fixed tuple
  in that order, with 5 bps marked the reference leg. Each leg preserves its
  complete M1-C result (trades, rejections, diagnostics). Invalid legs
  propagate as leg-tagged errors; nothing is repaired or retried.
- **Inputs:** shared dataset, strategy, params, quantity, brokerage. No
  slippage input exists — other legs are inexpressible.
- **Outputs:** frozen `{ referenceBps: 5, legs: [0bps, 5bps, 10bps] }`.
- **Assumptions:** delegation-only — zero slippage/cost/strategy/execution
  logic of its own; determinism inherited from M1-C.
- **Units:** basis points for the leg label; all economics in paise via M1-C.
- **Rounding policy:** none of its own (M1-C rules apply per leg).
- **Edge cases:** any invalid leg fails the whole harness with prefixed
  field paths; empty legs impossible by tuple type.
- **Source:** orchestration only; independently implemented, no employer
  material, no proprietary method.
- **Effective date:** n/a
- **Implementation version:** 1.0.0
- **Tests:** `tests/unit/strategy-lab-sensitivity.test.ts` (locked legs and
  order, shared-input observation across all 12 strategy calls, raw-price
  stability vs fill divergence, JSON-equality with direct M1-C runs, full
  trade-field preservation, leg-tagged errors, determinism, visible friction
  with no double deduction)
- **Limitations:** execution-cost sensitivity, not strategy optimization. No
  search, no ranking, no parameter choice, no predictive claim. A narrower
  spread across legs means cost-robustness on that fixture — nothing more.
  Not investment advice, not a prediction.

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
- GM-001 — Single-option BSM-Merton price and Greeks with fixed scenarios (GreekMap, v1.0.0, shipped). See §6.
- SLAB-DATA-001 — Strategy Lab historical dataset boundary (v1.0.0, shipped). See §10.
- SLAB-STRAT-001 — SMA cross with N-bar-low stop (v1.0.0, shipped). See §6.
- SLAB-EXEC-001 — Deterministic next-open backtester (v1.0.0, shipped). See §6.
- SLAB-COST-001 — Per-fill delivery cost and slippage pricer (v1.0.0, shipped). See §6.
- SLAB-SENS-001 — Execution-cost sensitivity harness (v1.0.0, shipped). See §6.

---

## 10. Strategy Lab dataset boundary (SLAB-DATA-001)

- **ID:** SLAB-DATA-001
- **Name:** Historical dataset parse, validation, and manifest verification
- **Owner:** Strategy Lab (`features/strategy-lab/dataset.ts`, with boundary
  parsers in `features/strategy-lab/validation.ts` and contracts in
  `features/strategy-lab/types.ts`)
- **Status:** shipped (M1-A)
- **Mathematical definition:** exact string-to-integer decoding only — no
  estimation, no model. Rupee decimals map to paise by digit shift
  (`"100.50"` → `10050`); SHA-256 over canonical ASCII bytes (LF, no BOM).
- **Inputs:** CSV text (`date,symbol,open,high,low,close,volume`); manifest
  object (`datasetId`, `version`, `source`, `sourceReference`, `retrievedAt`,
  `sha256`, `timezone`, `session`, `barInterval`, `adjustment`, `universe`,
  `dateRange`, `rowCount`).
- **Outputs:** frozen `readonly Bar[]` plus verified manifest, or a
  row-numbered invalid result. Never throws for data outcomes.
- **Assumptions:** NSE cash-equity daily bars; session `09:15–15:30
Asia/Kolkata`; data is split/bonus-adjusted; dividends excluded; symbol
  changes and delistings out of scope; missing trading days are gaps (never
  filled or synthesized); single-symbol universe in M1.
- **Units:** integer paise (money, cap ₹100 crore), integer shares (volume,
  cap 10^12), canonical `YYYY-MM-DD` dates.
- **Rounding policy:** none — parsing is exact; SHA-256 half-words use
  unsigned 32-bit wrap per the standard.
- **Edge cases:** BOM/non-ASCII rejected; wrong header rejected; short/long
  rows and blank interior rows rejected; non-canonical or impossible dates
  rejected; `>2`-decimal, negative, or over-cap prices rejected; zero/negative
  prices rejected at bar level; non-integer, negative, or unsafe volumes
  rejected; out-of-order or duplicate `(symbol, date)` rows rejected (never
  re-sorted); manifest hash/rowCount/dateRange/universe mismatches rejected.
- **Source / provenance:** independently derived for M1-A from the locked
  dataset contract. SHA-256 verified against NIST vectors (`""`, `"abc"`).
  Fixture `slab-sample-daily-001` is synthetic illustrative data authored
  in-repo — not NSE history, not market data. No employer, customer, student,
  proprietary, or Brahmos content.
- **Effective date:** n/a (not a statutory rate)
- **Implementation version:** 1.0.0
- **Tests:** `tests/unit/strategy-lab-dataset.test.ts` (NIST vectors,
  canonicalization, money/volume/date/symbol boundaries, ordering, OHLC,
  gaps, manifest mismatches, golden fixture, immutability)
- **Limitations (rendered on any future research UI):** single synthetic
  symbol; no survivorship coverage; close-to-close analysis only once later
  phases arrive; a positive fixture result proves pipeline correctness, not
  tradability. Not investment advice, not a prediction.
