# features/

One folder per tool. Nothing is implemented here in Phase 0.

```
features/
  risk-guard/      Phase 3+
  trade-plan/
  trade-cost/
  ...
```

Rules (enforced by review, and by ESLint for `lib/` and `components/`):

- `features/X` may import `lib/`, `components/ui`, `config/`, `types/`.
- `features/X` must **not** import `features/Y`. Promote shared logic to `lib/` only after a
  second real consumer exists.
- Each feature exposes a pure calculation module (no React, no browser APIs, no clock, no
  network) plus at most one primary `"use client"` island for interaction.
- Every formula needs a provenance record in `docs/calculation-assumptions.md` before it ships.
- No proprietary, employer-specific, or reverse-engineered logic. No Brahmos indicator.
