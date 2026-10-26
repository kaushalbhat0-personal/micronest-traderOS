# ADR-001 — Phase 0 Scaffold

- **Status:** Accepted
- **Date:** 27 October 2026
- **Decision owner:** MicroNest Trader OS
- **Supersedes:** none

---

## Context

The repository was an empty directory. There was no framework, toolchain, design system, test
harness, or documentation. The product direction is a lightweight, mobile-first, calculation-first
toolkit for Indian retail traders, with ten planned microtools and a future subscription and
partner programme.

Phase 0 must create a production-quality foundation **without implementing any trading tool**.

---

## Decisions

### 1. Framework and runtime

- **Next.js 16.4.3 App Router**, React 19.3.1, TypeScript 5.9.3 in `strict` mode.
- Turbopack is the default bundler in Next 16.
- Node.js >= 20.9; CI uses Node 24.
- No `src/` directory. Root-level `app/`, `features/`, `components/`, `lib/`, `config/`,
  `types/`, `tests/`, `e2e/`, `docs/`, `public/`.

**Why:** App Router gives Server Components by default, small client bundles, and a direct path
to static or server-rendered pages. Root-level folders match the agreed product structure and
keep tool code obvious.

### 2. Package manager and dependency policy

- **pnpm 11.8.0**, lockfile committed, exact versions (no `^` ranges).
- Only dependencies justified for the phase are installed.
- Explicitly excluded: `xlsx`, chart libraries, lodash, axios, state libraries, animation
  libraries, date libraries, form libraries, Supabase, payment SDKs, market-data APIs, analytics.

**Why:** Supply-chain surface and bundle size are product concerns. The foundation should be
small and reversible.

**Consequence:** ESLint is pinned to **9.39.5**, because Next 16's React, import, and jsx-a11y
plugins do not yet declare ESLint 10 support. This will be revisited.

### 3. Styling and design direction

- **Tailwind CSS 4.3.3** with semantic CSS variables in `app/globals.css`.
- Quiet financial utility: warm neutral canvas, white surfaces, dark ink, restrained emerald
  primary, semantic ok/warn/danger/info colours.
- Light mode only for the MVP. No gradients, glassmorphism, glow, or decorative animation.
- Cards use borders and moderate radius; shadows are minimal.
- All figures use tabular numerals.

**Why:** A consistent, low-noise visual language reduces cognitive load and keeps the product
feeling professional rather than promotional.

### 4. Testing

- **Vitest 5** for unit tests (node) and component tests (jsdom + Testing Library).
- **Playwright 1.64** for E2E on mobile (Pixel 7) and desktop Chrome, plus axe accessibility
  scans.
- Tests assert real invariants, not coverage theatre.

**Why:** Calculation engines must be testable without a browser. E2E protects the shell,
responsive layout, and accessibility baseline.

### 5. Local-first MVP

- No broker integration.
- No live market-data dependency.
- No paid external API.
- User input, paste, and CSV are the data sources.
- Future persistence sits behind an interface so it can move from local storage to Supabase
  without changing calculation engines.

**Why:** The product must be usable and testable without market-data infrastructure, and the
first MVP must not depend on a paid feed.

### 6. Money and rates

- Money is stored as **integer paise**.
- Percentages and commission rates use **integer basis points**.
- Formatting happens only at the UI edge, using `en-IN` grouping.
- Daily boundaries use **Asia/Kolkata**.

**Why:** Binary floating-point money is a correctness bug waiting to happen. Basis points make
0.5% and 20% exact.

### 7. Pricing configuration

- Plans and prices live in `config/plans.ts`.
- Three entitlement plans: Free, Individual Pro, All Access.
- Founding pricing is a **price cohort** on All Access, limited to 100 customers.
- No price literal appears in JSX.
- No checkout or payment integration in Phase 0.

**Why:** Product pricing will change. One configuration source keeps UI, entitlements, and future
billing consistent.

### 8. Partner programme boundary

- `config/partner.ts` records the 20% commission rate in basis points, monthly payout cadence,
  and received-revenue basis.
- No partner implementation, referral attribution, commission ledger, payout profile, or
  financial-data collection in Phase 0.
- Future payout details (UPI/bank) must be server-side, access-controlled, and never placed in
  localStorage, URLs, or analytics.

**Why:** Encoding the economics now prevents a magic number later without prematurely building a
sensitive subsystem.

### 9. Provenance and IP policy

- No Brahmos indicator.
- No proprietary, employer-specific, or reverse-engineered formulas.
- Every future calculation needs a record in `docs/calculation-assumptions.md`.
- Independently derived or public mathematics only.

**Why:** This is a product-integrity and legal-risk boundary, not a style preference.

### 10. Security baseline

- No secrets committed; `.env*` ignored except `.env.example`.
- No analytics, telemetry, or external API calls.
- Baseline security headers; `X-Powered-By` disabled.
- Server-only secrets will be separated when a backend is introduced.
- No financial or payout data is collected in Phase 0.

**Why:** Security is cheaper to design in than to retrofit. There is no backend yet, so the
baseline stays proportionate.

### 11. Documentation

- `docs/architecture.md` — stack, boundaries, future services.
- `docs/product-principles.md` — positioning and language rules.
- `docs/calculation-assumptions.md` — provenance template.
- This ADR.

**Why:** Decisions must survive the person who made them.

---

## Consequences

- The app builds and runs with zero environment variables.
- No trading tool works yet; the UI labels every tool honestly.
- The first real implementation phase can focus on the design system and RiskGuard without
  re-litigating the stack.
- Some dependencies (Supabase, payment SDKs) will be added later behind explicit boundaries.
- ESLint 9 is deprecated upstream but required by the current Next plugin ecosystem; this is a
  tracked maintenance item.

---

## Alternatives rejected

| Alternative                                       | Why rejected                                                         |
| ------------------------------------------------- | -------------------------------------------------------------------- |
| `create-next-app` defaults with floating versions | Violates the pinning requirement; harder to audit                    |
| `src/` directory                                  | Inconsistent with the agreed root-level structure                    |
| shadcn CLI bulk install                           | Adds unused components and dependencies before a real need           |
| Chart library in Phase 0                          | No charts yet; heavy bundle                                          |
| Supabase now                                      | No persistence or auth requirement yet; premature backend complexity |
| A generic tool/calculation framework              | No second consumer; would freeze the wrong abstraction               |
| Dark mode now                                     | Doubles the visual QA surface without a product need                 |
| Hardcoded prices in pricing page                  | Guarantees drift between UI and billing                              |

---

## Follow-ups

1. Phase 1: design-system primitives required by the product shell (Field, inputs, result rows).
2. Phase 2: `lib/money`, `lib/trading`, storage, usage and entitlement primitives.
3. Phase 3: RiskGuard engine with table-driven tests and a provenance record.
4. Before paid launch: server-side entitlement enforcement, tax/payment review, and regulatory
   copy review.
5. Revisit the ESLint major when Next's plugin ecosystem supports it.
