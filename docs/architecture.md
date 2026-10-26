# Architecture

**MicroNest Trader OS** — a lightweight, mobile-first decision-support toolkit for Indian
retail traders.

**Phase:** 1 — Design System + Product Shell (27 October 2026). No trading tool logic is
implemented yet.

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
[ADR-001](decisions/ADR-001-scaffold.md). What belongs in each file is governed by
[§13 Source of truth and file organization](#13-source-of-truth-and-file-organization).

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
- `app/error.tsx` is the only Client Component in Phase 1, because error boundaries require it.
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

Vercel-compatible, zero custom server. No deployment automation is configured in Phase 1 beyond
CI verification. No environment variables are required to build.

---

## 13. Source of truth and file organization

This is a permanent rule for every phase, not a description of Phase 1.

### 13.1 One source of truth per decision

| Decision                              | Source of truth                                | Consumers                                 |
| ------------------------------------- | ---------------------------------------------- | ----------------------------------------- |
| Tool list, groups, statuses           | `config/tools.ts`                              | landing page, `/tools`, `ToolCard`, tests |
| Prices, entitlements, founding cohort | `config/plans.ts`                              | `/pricing`, tests                         |
| Partner commission economics          | `config/partner.ts`                            | tests, future billing                     |
| Colour, spacing, radius, focus tokens | `app/globals.css` — `:root` + `@theme inline`  | every component                           |
| Type hierarchy                        | `app/globals.css` — `@utility type-*` / `tnum` | every component                           |
| Tool icon identity                    | `components/ui/tool-card.tsx`                  | tool cards                                |
| Status → label, tone, icon            | `components/ui/status-badge.tsx`               | tool cards, future tool pages             |

A page may _present_ these decisions; it must never restate them. Counts, names, prices and
statuses are derived at render time through `statusCounts()`, `toolsInGroup()` and `getPrice()`.
Adding a tool without an icon is a type error, because the icon map is keyed by the derived
`ToolId` union.

Presentation detail belongs with presentation: tool icons live in the card component, not in
`config/tools.ts`, because an icon is a visual decision and the registry is a product decision.

### 13.2 Main file first

Each tool keeps its logic in one main domain file:

```text
features/risk-guard/
  risk-guard.ts        ← domain logic, the single source of truth
  validation.ts        ← input boundary
  components/
    risk-guard-form.tsx
    risk-guard-results.tsx
```

Do **not** split one calculation into `calculate-risk.ts`, `calculate-lots.ts`,
`calculate-reward.ts`, … merely because the functions are conceptually separate. Split only when:

1. the file has become genuinely hard to read,
2. the responsibility is independent,
3. a real second consumer exists,
4. the split improves maintainability.

Supporting files present, adapt, validate, compose, format or test the main file. They never
duplicate its logic.

### 13.3 No speculative abstraction

An abstraction needs a real consumer. Phase 1 therefore has no `EmptyState` or `Field` primitive:
nothing renders one yet. They are introduced by the first tool that needs them, not in advance.
Speculative hooks, contexts, generic tool frameworks and generic calculation frameworks are out of
scope by default.

### 13.4 Design system first

The dependency direction for visual decisions is:

```text
token (globals.css) → primitive (components/ui) → composed component → page
```

A page does not invent arbitrary values when a token or primitive expresses the same thing. A
pattern is promoted into the design system on its second genuine use, and only when the semantics
match — two similar-looking elements with different meanings stay separate.

### 13.5 Feature-oriented organization

Folders follow the product, not the framework:

- `features/<tool>/` owns a tool's engine and its UI.
- `config/` owns product decisions: tools, plans, partner economics.
- `components/ui/` owns reusable presentation with no product knowledge.
- `components/layout/` owns the shell: container, header, footer, page header.
- `lib/` owns pure helpers and formatting.
- `types/` owns shared domain primitives.

SOLID, DRY, KISS and YAGNI are applied against this layout: dependencies point inward, and no
feature reaches sideways into another feature.

### 13.6 Questions to answer before adding a file

1. Does this file have one real responsibility?
2. Is this logic already present somewhere else?
3. Could the logic stay in the source-of-truth file?
4. Is the abstraction used by more than one meaningful consumer?
5. Does it add indirection without removing complexity?
6. Does it follow the dependency direction in §4?

If the answer to (1), (3) or (6) is no, or the answer to (2) is yes, do not add the file.

### 13.7 Connected tools (input handoff, not shared logic)

Tools stay independent. When one tool continues into another, the handoff carries **inputs
only** — never duplicated calculations:

- TradePlan → RiskGuard: `direction`, `entry`, `stop`, optional `target`, as plain URL query
  values. No setup text, thesis, invalidation or notes ever enter the URL.
- RiskGuard re-validates every carried value at its own boundary
  (`parseHandoffParams` in `features/risk-guard/validation.ts`); invalid values are dropped,
  and the Zod schema still governs on submit.
- Prefilled values render as normal editable form fields. RiskGuard always calculates from
  what is in its own form.
- The handoff is ephemeral: no storage, no global state, no shared kernel. Each domain file
  remains the sole source of truth for its own calculation (TP-001 vs RG-001).
- The post-sizing decision comparison is presentation only: it juxtaposes frozen plan-origin
  values against the authoritative sizing result and computes nothing new.

---

## 14. Decision log

- [ADR-001 — Phase 0 scaffold](decisions/ADR-001-scaffold.md)
- [Product principles](product-principles.md)
- [Calculation assumptions](calculation-assumptions.md)
