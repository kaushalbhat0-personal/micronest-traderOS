# MicroNest Trader OS

> **Understand your trade before taking it.**

A lightweight, mobile-first decision-support toolkit for Indian retail traders. Ten focused
microtools for planning, sizing, analysing and reviewing trades — calculations and structure,
not signals.

**Status: Pre-deployment — foundation, five live tools (RiskGuard, TradePlan, TradeCost, StrikeLens, GreekMap) and premium UI Phases 0–5 complete.**

---

## What this is

- A microtool ecosystem: RiskGuard, TradePlan, TradeCost, StrikeLens, GreekMap, OI Mapper,
  StructureMap, SetupScore, LeakDetector, ReviewOS.
- Calculation-first: manual inputs, transparent outputs, documented assumptions.
- Local-first: no broker connection, no live market data, no paid external API.
- Mobile-first and accessible.

## What this is not

A broker terminal, charting platform, signal service, prediction engine, AI stock picker,
generic trading journal, or full trading SaaS.

---

## Quick start

```bash
pnpm install
pnpm dev
```

Open <http://localhost:3000>. **No environment variables are required.**

```bash
cp .env.example .env.local   # only if you need optional local values
```

---

## Commands

| Command             | Purpose                                     |
| ------------------- | ------------------------------------------- |
| `pnpm dev`          | Start the development server (Turbopack)    |
| `pnpm build`        | Production build                            |
| `pnpm start`        | Start the production server                 |
| `pnpm lint`         | ESLint                                      |
| `pnpm typecheck`    | Generate route types and run `tsc --noEmit` |
| `pnpm test`         | Vitest unit + component tests               |
| `pnpm test:watch`   | Vitest in watch mode                        |
| `pnpm test:e2e`     | Playwright (mobile + desktop)               |
| `pnpm format`       | Prettier write                              |
| `pnpm format:check` | Prettier check                              |

First E2E run:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

---

## Structure

```text
app/            routes and layouts (Server Components by default)
features/       one folder per tool (Phase 1+)
components/     ui primitives + layout shell
config/         tools registry, plans, partner economics
lib/            env, formatting, shared utilities
types/          shared domain primitives
tests/          unit + component tests
e2e/            Playwright specs
docs/           architecture, principles, provenance, ADRs
```

Dependency direction: `app → features → lib`. No feature imports another feature. `lib/` never
imports features, components, or app code.

---

## Configuration, not hardcoded values

- Prices and plan entitlements: `config/plans.ts` (integer paise; founding is a cohort on All
  Access).
- Tool registry and statuses: `config/tools.ts`.
- Partner economics: `config/partner.ts` (20% in basis points; monthly payouts; received-revenue
  basis). **No partner system or payout data collection exists yet.**

---

## Documentation

- [Architecture](docs/architecture.md)
- [Product principles](docs/product-principles.md)
- [Calculation assumptions & provenance](docs/calculation-assumptions.md)
- [ADR-001 — Phase 0 scaffold](docs/decisions/ADR-001-scaffold.md)

---

## Principles in one line

No buy/sell recommendations. No guaranteed predictions. No proprietary or employer-specific
logic. No Brahmos indicator. Every future formula gets a documented, independently derived
source.

---

## Disclaimer

Calculations and analysis tools only. Not investment advice. Verify inputs and applicable
charges before trading.
