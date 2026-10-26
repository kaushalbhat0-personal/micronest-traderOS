# Product Principles

**Positioning:** _Understand your trade before taking it._

MicroNest Trader OS is a lightweight toolkit for Indian retail traders. It helps a trader plan,
size, analyse and review their own decisions. It does not make decisions for them.

---

## 1. What we are building

- A **microtool ecosystem**: ten focused tools, each with one clear job.
- A **calculation-first** product: inputs in, transparent outputs out.
- A **decision-support** product: structure, checks, estimates and review.
- A **mobile-first** product: fast to open, easy to use with one hand.
- A **low-cognitive-load** product: one primary action per screen, no dashboard sprawl.

## 2. What we are not building

- A broker terminal, order router, or exchange terminal.
- A charting platform or TradingView clone.
- A live option-chain or market-data terminal.
- A signal-selling, tip, or copy-trading platform.
- An AI stock picker, prediction engine, or guaranteed-return product.
- A generic trading journal or full trading SaaS.
- An employer-specific indicator product.

If a feature only makes sense as part of one of the above, it does not belong here.

---

## 3. Product principles

1. **One job per tool.** If a screen needs a second purpose, it is a second tool.
2. **Manual data first.** Prefer user input, paste, or CSV. Do not require a broker connection
   or live feed.
3. **Transparent calculations.** Show the inputs, the formula's assumptions, and the units.
   Distinguish a calculation from an estimate and from user-defined analysis.
4. **No unnecessary dashboards.** The landing page is an index, not a metrics wall.
5. **Fast by default.** Server Components, minimal client JavaScript, no chart library, no
   decorative animation.
6. **Mobile first.** Design at 360px, then expand. No horizontal scrolling. 44px touch targets.
7. **Accessible.** WCAG 2.2 AA target: labels, focus, contrast, keyboard operation, reduced
   motion, text alternatives.
8. **Reversible.** Small changes, clear ownership, tests before UI.
9. **No feature bloat.** Every dependency and abstraction must earn its place.
10. **No fake functionality.** A planned tool is labelled planned. A button that cannot work is
    disabled and explained.

---

## 4. Language rules

Use:

- "calculate", "estimate", "compare", "organise", "review"
- "based on the inputs you entered"
- "verify with your broker"
- "not investment advice"

Never use:

- "guaranteed", "assured", "risk-free", "sure shot"
- "accurate prediction", "market will", "will definitely"
- "best strike", "best trade", "must buy", "must sell"
- "recommended trade", "signal", "target achieved"
- any claim of regulatory registration or approval

All tools must clearly separate:

| Kind                  | Meaning                                   | Example                       |
| --------------------- | ----------------------------------------- | ----------------------------- |
| Calculation           | Deterministic arithmetic on user inputs   | position size, R:R            |
| Estimate              | Approximate model with stated assumptions | charges, slippage             |
| User-defined analysis | The trader's own criteria or notes        | setup checklist, review notes |

---

## 5. Risk and regulatory posture

- No buy/sell recommendations.
- No price predictions or guaranteed outcomes.
- No portfolio management or personalised advice.
- No claims about SEBI registration or regulatory status.
- Applicable disclosures will be published before a paid launch.
- Charges and statutory rates are estimates with a visible effective date; the user must verify
  them.
- The highest-risk tools for perception (SetupScore, OI Mapper, StrikeLens) require a copy and
  compliance review before they are made public.

---

## 6. IP and provenance policy

- **No Brahmos indicator.** Do not implement it, reference its formula, or reproduce its
  behaviour.
- Do not reverse-engineer proprietary indicators.
- Do not copy employer-specific formulas, code, branding, customer data, or teaching material.
- Do not import a proprietary trading methodology into the product.
- Every calculation must be independently derived or based on public mathematics, with a record
  in [calculation-assumptions.md](calculation-assumptions.md).
- A formula without a provenance record does not ship.

---

## 7. Pricing philosophy

- Free is genuinely useful, with limits.
- Paid plans add capacity, history, and exports — not access to basic correctness.
- Founding pricing is a cohort on All Access, limited to the first 100 customers.
- Prices are configuration, never hardcoded into components.
- No dark patterns: no fake countdowns, no forced urgency, no hidden renewal.
- Checkout stays closed until billing, taxes, and entitlements are real.

---

## 8. Review checklist for every new feature

- [ ] Does it fit one of the ten tools, or is it a new product?
- [ ] Is the calculation pure and unit-tested?
- [ ] Are assumptions and units documented?
- [ ] Does it avoid advice, predictions, and guarantees?
- [ ] Does it work at 360px with keyboard only?
- [ ] Is the client island as small as possible?
- [ ] Is every new dependency justified?
- [ ] Is any new data storage explicit, minimal, and secure?
- [ ] Is the status label honest (live / coming soon / planned)?
