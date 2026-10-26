# Architecture

**MicroNest Trader OS** — a lightweight, mobile-first decision-support toolkit for Indian
retail traders.

**Phase:** 0 — Foundation (27 October 2026). No trading tool is implemented yet.

---

## 1. Scope boundary

The product is a set of small, focused calculators and review tools. It is **not**:

- a broker terminal or order-routing system
- a charting platform or TradingView clone
- a live option-chain or market-data terminal
- a signal service, tip provider, or AI stock picker
- a prediction engine or guaranteed-return product
- a generic trading journal or full trading SaaS
- an employer-specific or proprietary indicator product

No broker integration, live market data, payments, authentication, or partner system exists in
Phase 0. The app runs with zero environment variables.

---

## 2. Stack

| Layer                  | Choice                                 | Pinned version          |
| ---------------------- | -------------------------------------- | ----------------------- |
| Framework              | Next.js App Router (Turbopack default) | 16.4.3                  |
| UI runtime             | React / React DOM                      | 19.3.1                  |
| Language               | TypeScript, `strict`                   | 5.9.3                   |
| Styling                | Tailwind CSS + `@tailwindcss/postcss`  | 4.3.3                   |
| Validation             | Zod                                    | 4.6.7                   |
| Icons                  | Lucide React                           | 1.61.0                  |
| Unit / component tests | Vitest + jsdom + Testing Library       | 5.0.5 / 30.1.3 / 16.3.3 |
| E2E / a11y             | Playwright + axe-core                  | 1.64.1 / 4.14.0         |
| Lint / format          | ESLint (Next config) + Prettier        | 9.39.5 / 3.9.10         |
| Package manager        | pnpm                                   | 11.8.0                  |
| Runtime                | Node.js                                | >= 20.9 (CI: 24)        |

ESLint is pinned to the 9.x line because Next 16's React, import and jsx-a11y plugins do not yet
declare ESLint 10 support. Revisit when `eslint-config-next` does.

---

## 3. Folder structure

```text
app/                     routes, layouts, global CSS
  (marketing)/           pricing, disclaimer
  (tools)/               tool shell + /tools index
features/                one folder per tool (Phase 1+)
components/
  ui/                    design-system primitives
  layout/                shell, header, footer, containers
  tools/                 tool-grid presentation
config/                  tools registry, plans, partner economics
lib/                     env, formatting, shared utilities
types/                   shared domain primitives
tests/                   unit + component tests
e2e/                     Playwright specs
docs/                    architecture, principles, provenance, ADRs
public/                  static assets
```

`src/` is intentionally not used. Root-level folders match the project decision recorded in
[ADR-001](decisions/ADR-001-scaffold.md).

---

## 4. Dependency direction

```text
app/        → features/, components/, lib/, config/, types/
features/X  → lib/, components/ui, config/, types/
components/ → lib/, config/, types/          (never features/)
lib/        → types/ only                    (never features/, components/, app/)
config/     → types/ only
types/      → nothing
```

Rules:

1. **No feature imports another feature.** If two tools need the same logic, move it to `lib/`
   only after the second consumer exists.
2. **`lib/` is the lowest layer.** It contains pure, testable code. ESLint enforces that it does
   not import features, components, or app code.
3. **Components stay presentational.** ESLint enforces that `components/` does not import
   features.
4. **No premature framework.** There is deliberately no generic "tool framework" or
   "calculation framework". Each tool owns its engine until a real shared need appears.

---

## 5. Server / client boundary

- Layouts and pages are **Server Components** by default.
- A tool route should have **one primary `"use client"` island** for interaction. The page shell,
  headings, disclaimers and static content stay on the server.
- Calculation engines must be pure TypeScript with no React, browser, clock, or network imports.
  They can run on either side and are tested directly.
- `app/error.tsx` is the only Client Component in Phase 0, because error boundaries require it.
- No secrets are read in client code. Only `NEXT_PUBLIC_*` values may cross the boundary.

---

## 6. Local-first philosophy

- MVP data is user-entered, pasted, or imported from CSV.
- No live market data, broker connection, or paid API is required.
- Persistence will start in the browser behind an interface, so a server store can replace it
  without rewriting tool logic.
- Money is stored as **integer paise**; rates use **integer basis points**. Formatting happens
  only at the UI edge.
- Daily boundaries use **Asia/Kolkata**, not UTC.

Phase 0 does not implement persistence. The interface boundary will be introduced with the first
tool that saves data.

---

## 7. Future persistence boundary (Supabase)

Not installed and not configured in Phase 0.

When accounts are needed:

- Add `lib/supabase/` with separate browser and server clients.
- Keep the service-role key in a **server-only** module; never expose it via `NEXT_PUBLIC_*`.
- Enable RLS default-deny on every user-owned table.
- Store ownership checks server-side, not in client state.
- Migrate local drafts explicitly; never silently upload user data.
- Keep the domain engines unchanged; persistence is an adapter, not a dependency of calculations.

---

## 8. Future billing boundary

Not implemented. No checkout, payment SDK, webhook, invoice, or tax logic exists.

Planned shape:

```text
customer → subscription → payment received → entitlement snapshot
```

- Prices and plan entitlements live in `config/plans.ts`.
- A runtime entitlement snapshot (`planId`, `status`, `cohort`, `periodEnd`) resolves to
  capabilities. Components never read prices directly.
- Client-side limits are UX only. Once money is involved, entitlement checks must run
  server-side.
- Founding pricing is a **price cohort on All Access**, not a fourth plan. A founding customer
  receives All Access entitlements.
- Refunds, failed payments, and cancellations must downgrade entitlements deterministically.

---

## 9. Future partner boundary

Not implemented. No referral attribution, commission ledger, partner login, payout profile, or
financial-data collection exists.

Intended flow:

```text
customer
   ↓
subscription
   ↓
payment received
   ↓
referral attribution
   ↓
20% commission ledger
   ↓
monthly payout
   ↓
UPI / bank transfer
```

Rules:

- Commission is **20% of subscription revenue actually received/settled**, not invoiced revenue.
- Payout cadence is **monthly**, not weekly.
- Refunds, cancellations, failed payments and billing adjustments reduce the commission base.
- A partner payout profile is required before payout.
- Supported payout methods are UPI or bank transfer.
- **Payout details are sensitive financial data.** They must be stored only in access-controlled
  server-side storage. They must never be written to `localStorage`, placed in URLs, sent to
  analytics, or exposed to the client unnecessarily.
- The 20% rate lives in `config/partner.ts` as integer basis points. It must not become an
  unexplained magic number in billing code.

---

## 10. Security baseline

- No secrets in the repository; `.env*` is ignored except `.env.example`.
- No financial or payout data is collected in Phase 0.
- No analytics, telemetry, or external API calls.
- Baseline response headers: `X-Content-Type-Options`, `X-Frame-Options`,
  `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` disabled.
- A nonce-based Content-Security-Policy is deferred until there is a server boundary.
- Dependencies are pinned exactly; the lockfile is committed.
- The service-role key and payment secrets will be server-only when introduced.

---

## 11. Testing and CI

- **Unit:** pure configuration and formatting invariants (Vitest, node).
- **Component:** accessible primitives (Vitest, jsdom, Testing Library).
- **E2E:** routes, pricing, skip link, touch targets, responsive overflow, security headers,
  reduced motion (Playwright, mobile + desktop).
- **Accessibility:** axe scans against WCAG 2.2 A/AA tags.
- **CI:** lint → typecheck → unit tests → build; Playwright runs in a separate job after a
  production build.

Calculation engines will add table-driven unit tests with hand-computed expected values before
any UI is written.

---

## 12. Deployment

Vercel-compatible, zero custom server. No deployment automation is configured in Phase 0 beyond
CI verification. No environment variables are required to build.

---

## 13. Decision log

- [ADR-001 — Phase 0 scaffold](decisions/ADR-001-scaffold.md)
- [Product principles](product-principles.md)
- [Calculation assumptions](calculation-assumptions.md)
