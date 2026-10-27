"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Real-product showcase (UI-6C). One interactive island: five tool selectors
 * drive a single `next/image` panel plus one outcome sentence and one live
 * link. Screenshots are frozen UI-6B derivatives — never regenerated,
 * cropped, or annotated here. Switching is instant by design: only the
 * selected image renders, so there is no crossfade, preload machinery, or
 * animation dependency.
 */

type ShowcaseKey = "risk-guard" | "trade-plan" | "trade-cost" | "strike-lens" | "greek-map";

type ShowcaseEntry = {
  key: ShowcaseKey;
  name: string;
  image: string;
  alt: string;
  outcome: string;
  route: string;
};

const SHOWCASE_ORDER: readonly ShowcaseEntry[] = [
  {
    key: "risk-guard",
    name: "RiskGuard",
    image: "/product/risk-guard.webp",
    alt: "RiskGuard result showing 200 allowed units within a \u20B91,000 risk budget.",
    outcome: "Allowed quantity 200 units within a \u20B91,000 risk budget.",
    route: "/tools/risk-guard",
  },
  {
    key: "trade-plan",
    name: "TradePlan",
    image: "/product/trade-plan.webp",
    alt: "TradePlan showing a coherent long plan with a 2.00 reward-to-risk ratio.",
    outcome:
      "Coherent long plan with entry \u20B9100, stop \u20B995 and target \u20B9110 \u2014 2.00 reward-to-risk.",
    route: "/tools/trade-plan",
  },
  {
    key: "trade-cost",
    name: "TradeCost",
    image: "/product/trade-cost.webp",
    alt: "TradeCost showing \u20B91,906.23 net P&L after \u20B993.77 in transaction charges.",
    outcome: "Net P&L \u20B91,906.23 after \u20B993.77 in transaction charges.",
    route: "/tools/trade-cost",
  },
  {
    key: "strike-lens",
    name: "StrikeLens",
    image: "/product/strike-lens.webp",
    alt: "StrikeLens comparing 95 and 105 CE strikes with intrinsic, extrinsic and breakeven values.",
    outcome: "95 CE and 105 CE compared side by side on price split and breakeven.",
    route: "/tools/strike-lens",
  },
  {
    key: "greek-map",
    name: "GreekMap",
    image: "/product/greek-map.webp",
    alt: "GreekMap showing a \u20B92.54 model value and five option Greeks for a 30-day ATM call.",
    outcome: "30-day ATM call modelled at \u20B92.54, with five Greeks alongside.",
    route: "/tools/greek-map",
  },
] as const;

const DEFAULT_KEY: ShowcaseKey = "risk-guard";

export function ProductShowcase() {
  const [selected, setSelected] = useState<ShowcaseKey>(DEFAULT_KEY);
  const active = SHOWCASE_ORDER.find((entry) => entry.key === selected) ?? SHOWCASE_ORDER[0]!;

  return (
    <div>
      <div role="group" aria-label="Choose a tool to preview" className="flex flex-wrap gap-2">
        {SHOWCASE_ORDER.map((entry) => {
          const pressed = entry.key === active.key;
          return (
            <button
              key={entry.key}
              type="button"
              aria-pressed={pressed ? "true" : "false"}
              onClick={() => setSelected(entry.key)}
              className={cn(
                "type-label inline-flex min-h-11 items-center justify-center rounded-lg border px-4 py-2 transition-colors duration-150",
                pressed
                  ? "border-primary bg-primary text-on-primary"
                  : "border-line bg-surface text-ink hover:bg-surface-muted",
              )}
            >
              {entry.name}
            </button>
          );
        })}
      </div>

      <figure className="mt-6 overflow-hidden rounded-xl border border-line bg-surface p-3 shadow-1 sm:p-5">
        <Image
          key={active.key}
          src={active.image}
          alt={active.alt}
          width={2880}
          height={1800}
          sizes="(max-width: 640px) 100vw, (max-width: 1152px) 90vw, 1120px"
          priority={active.key === DEFAULT_KEY}
          className="h-auto w-full rounded-lg border border-line"
          data-testid="showcase-image"
        />
        <figcaption className="type-caption mt-3 text-ink-muted">
          Real product screen with synthetic illustrative inputs — never market data.
        </figcaption>
      </figure>

      <div aria-live="polite" className="mt-6 max-w-2xl">
        <p className="type-subtitle">{active.name}</p>
        <p className="type-body mt-1.5 text-ink-muted">{active.outcome}</p>
        <Link
          href={active.route}
          className="type-label mt-3 inline-flex min-h-11 items-center text-primary underline underline-offset-4"
        >
          Open {active.name} {"\u2192"}
        </Link>
      </div>
    </div>
  );
}
