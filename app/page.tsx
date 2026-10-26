import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { TOOL_GROUPS, TOOLS, statusCounts, toolsInGroup, type ToolGroup } from "@/config/tools";

const PROBLEMS = [
  {
    title: "Sizing is a decision",
    detail: "How much to risk deserves the same attention as direction.",
  },
  {
    title: "Charges change the maths",
    detail: "Brokerage, taxes and statutory charges move a trade's breakeven.",
  },
  {
    title: "Review closes the loop",
    detail: "A repeatable review is how a trader's own process improves.",
  },
] as const;

const PRINCIPLES = [
  {
    title: "Manual inputs",
    detail: "Your numbers, or data you import. No broker login and no live feed.",
  },
  {
    title: "Transparent assumptions",
    detail: "Each calculation states its inputs, units and rounding.",
  },
  {
    title: "No recommendations",
    detail: "The tools organise your thinking. They never say what to buy or sell.",
  },
] as const;

function GroupCard({ group }: { group: ToolGroup }) {
  const tools = toolsInGroup(group.id);

  return (
    <Card className="flex h-full flex-col gap-3">
      <h3 className="type-subtitle">{group.name}</h3>
      <p className="type-helper text-ink-muted">{group.description}</p>
      {/* The names are the count: listing them is more useful than "3 tools". */}
      <p className="type-caption mt-auto border-t border-line pt-3 text-ink-muted">
        {tools.map((tool) => tool.name).join(" · ")}
      </p>
    </Card>
  );
}

export default function HomePage() {
  const counts = statusCounts();
  const liveLabel = counts.live === 0 ? "none live yet" : `${counts.live} live`;
  const statusLine = `${TOOLS.length} tools · ${counts.planned} planned · ${counts.coming_soon} in development · ${liveLabel}`;

  return (
    <>
      <section className="border-b border-line">
        <Container className="py-14 sm:py-20">
          <p className="type-eyebrow text-ink-muted">MicroNest Trader OS</p>

          <h1 className="type-display mt-3 max-w-2xl">Understand your trade before taking it.</h1>

          <p className="type-body mt-4 max-w-2xl text-ink-muted">
            A lightweight toolkit to help you plan, size, analyse and review trades. Clear
            calculations and structured thinking — not signals.
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Link href="/tools" className={buttonClasses("primary", "w-full sm:w-auto")}>
              Explore the toolkit
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <Link href="/pricing" className={buttonClasses("secondary", "w-full sm:w-auto")}>
              View pricing
            </Link>
          </div>

          <p className="type-caption mt-6 text-ink-muted">{statusLine}</p>
        </Container>
      </section>

      <section className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <div className="max-w-2xl">
            <h2 className="type-section">Direction is the easy part</h2>
            <p className="type-body mt-2 text-ink-muted">
              Trading decisions involve more than a view on direction. Sizing, charges, structure
              and review decide how a plan holds up.
            </p>
          </div>

          <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-3">
            {PROBLEMS.map((item) => (
              <li key={item.title} className="border-t border-line pt-4">
                <h3 className="type-subtitle">{item.title}</h3>
                <p className="type-helper mt-1.5 text-ink-muted">{item.detail}</p>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <h2 className="type-section">The toolkit</h2>
              <p className="type-body mt-2 text-ink-muted">
                Ten focused tools, grouped by the job they do. Each one does a single job well.
              </p>
            </div>
            <Link href="/tools" className={buttonClasses("secondary")}>
              Browse all tools
            </Link>
          </div>

          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TOOL_GROUPS.map((group) => (
              <li key={group.id}>
                <GroupCard group={group} />
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="border-b border-line bg-surface-muted">
        <Container className="py-12 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12">
            <div>
              <p className="type-eyebrow text-ink-muted">Philosophy</p>
              <h2 className="type-section mt-2">Calculations and structure, not signals.</h2>
            </div>

            <ul className="grid gap-6 sm:grid-cols-3">
              {PRINCIPLES.map((item) => (
                <li key={item.title}>
                  <h3 className="type-subtitle">{item.title}</h3>
                  <p className="type-helper mt-1.5 text-ink-muted">{item.detail}</p>
                </li>
              ))}
            </ul>
          </div>
        </Container>
      </section>

      <Container className="py-12">
        <Callout title="Before you trade">
          Calculations and analysis tools only. Not investment advice. Verify inputs and applicable
          charges before trading.
        </Callout>
      </Container>
    </>
  );
}
