import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { ToolGrid } from "@/components/tools/tool-grid";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

const PILLARS = [
  {
    term: "Ten focused tools",
    detail: "One clear job each. No terminal, no charting clutter.",
  },
  {
    term: "Manual inputs",
    detail: "Your numbers, or CSV you control. No broker login.",
  },
  {
    term: "Decision support",
    detail: "Calculations and structure — never buy or sell calls.",
  },
] as const;

export default function HomePage() {
  return (
    <>
      <section className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <p className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
            MicroNest Trader OS
          </p>

          <h1 className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            Understand your trade before taking it.
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-muted sm:text-lg">
            A lightweight toolkit to help you plan, size, analyse and review trades. Clear
            calculations and structured thinking — not signals.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/tools" className={buttonClasses("primary")}>
              Explore the toolkit
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link href="/pricing" className={buttonClasses("secondary")}>
              View pricing
            </Link>
          </div>

          <dl className="mt-10 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
            {PILLARS.map((pillar) => (
              <div key={pillar.term} className="rounded-xl border border-line bg-surface p-4">
                <dt className="text-sm font-medium">{pillar.term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-ink-muted">{pillar.detail}</dd>
              </div>
            ))}
          </dl>
        </Container>
      </section>

      <Container className="py-12">
        <div className="mb-8 max-w-2xl space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">The toolkit</h2>
          <p className="text-sm leading-relaxed text-ink-muted">
            RiskGuard is the first tool in development. Everything else is planned and clearly
            marked.
          </p>
        </div>

        <ToolGrid />

        <Callout title="Before you trade" className="mt-10">
          Calculations and analysis tools only. Not investment advice. Verify inputs and applicable
          charges before trading.
        </Callout>
      </Container>
    </>
  );
}
