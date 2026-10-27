import {
  Activity,
  ArrowRight,
  ClipboardList,
  Receipt,
  ShieldCheck,
  Target,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { ProductShowcase } from "@/components/home/product-showcase";
import { buttonClasses } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { ReceiptRow, ReceiptSection } from "@/components/ui/receipt";
import { Reveal } from "@/components/ui/reveal";
import { ToolCard } from "@/components/ui/tool-card";
import {
  TOOL_GROUPS,
  TOOLS,
  statusCounts,
  toolsInGroup,
  type ToolGroup,
  type ToolId,
} from "@/config/tools";
import {
  compareStrikes,
  STRIKE_LENS_FORMULA_ID,
  STRIKE_LENS_ROUNDING_NOTE,
  type StrikeLensInput,
} from "@/features/strike-lens/strike-lens";

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

/**
 * Presentation-only decision order for the homepage workflow. Each step
 * references a live registry tool by id — names, summaries and destinations
 * resolve from `TOOLS` at render time, so nothing is duplicated and no step
 * can point at a tool that does not exist. This is explanatory navigation,
 * not a wizard: the caveat below the list says so.
 */
const WORKFLOW = [
  {
    step: "01",
    verb: "Plan",
    toolId: "trade-plan",
    role: "Write the idea down as levels: entry, stop, target.",
  },
  {
    step: "02",
    verb: "Size",
    toolId: "risk-guard",
    role: "Check the quantity against your own risk budget.",
  },
  {
    step: "03",
    verb: "Weigh costs",
    toolId: "trade-cost",
    role: "Estimate charges before they move your breakeven.",
  },
  {
    step: "04",
    verb: "Compare",
    toolId: "strike-lens",
    role: "Compare strikes on price, value split and breakeven.",
  },
  {
    step: "05",
    verb: "Model",
    toolId: "greek-map",
    role: "Replay your assumptions through a textbook model.",
  },
] as const satisfies ReadonlyArray<{ step: string; verb: string; toolId: ToolId; role: string }>;

/** Step icons mirror each tool's meaning. Presentation mapping, kept local. */
type WorkflowToolId = (typeof WORKFLOW)[number]["toolId"];
const WORKFLOW_ICONS: Record<WorkflowToolId, LucideIcon> = {
  "trade-plan": ClipboardList,
  "risk-guard": ShieldCheck,
  "trade-cost": Receipt,
  "strike-lens": Target,
  "greek-map": Activity,
};

/** Display-only INR formatting for the trust demo. The engine only sees integer paise. */
const demoInr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatDemoPaise(paise: number): string {
  return demoInr.format(paise / 100);
}

/**
 * Fixed illustrative inputs for the homepage trust demo. Integer paise per
 * the domain convention: Spot ₹100.00, CE, Strike ₹95.00, Premium ₹8.00.
 * Synthetic and deterministic — never market data, never user data.
 */
const TRUST_DEMO_INPUT: StrikeLensInput = {
  spotPaise: 10_000,
  optionType: "call",
  rows: [{ strikePaise: 9_500, premiumPaise: 800 }],
};

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
  const liveTools = TOOLS.filter((tool) => tool.status === "live");
  const plannedTools = TOOLS.filter((tool) => tool.status !== "live");
  const liveLabel = counts.live === 0 ? "none live yet" : `${counts.live} live`;
  const segments = [
    liveLabel,
    counts.coming_soon > 0 ? `${counts.coming_soon} in development` : null,
    counts.planned > 0 ? `${counts.planned} planned` : null,
  ].filter((segment): segment is string => segment !== null);
  const statusLine = `${TOOLS.length} tools · ${segments.join(" · ")}`;

  // Trust demo: run the real StrikeLens engine once against the fixed
  // illustrative inputs. Outputs below are engine-derived, never hardcoded —
  // if the engine changes, this demonstration changes with it.
  const trustDemo = compareStrikes(TRUST_DEMO_INPUT);
  const trustFirstRow = trustDemo.status === "compared" ? trustDemo.rows[0] : undefined;
  const trustRow = trustFirstRow?.status === "ok" ? trustFirstRow : undefined;

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
            <Link href="/tools" className={`${buttonClasses("primary", "w-full sm:w-auto")} group`}>
              Explore the toolkit
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform [transition-duration:var(--motion-micro)] group-hover:translate-x-0.5"
              />
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
          <Reveal>
            <div className="max-w-2xl">
              <h2 className="type-section">Direction is the easy part</h2>
              <p className="type-body mt-2 text-ink-muted">
                Trading decisions involve more than a view on direction. Sizing, charges, structure
                and review decide how a plan holds up.
              </p>
            </div>
          </Reveal>

          <ul className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-3">
            {PROBLEMS.map((item, index) => (
              <Reveal as="li" key={item.title} delay={index * 60}>
                <div className="border-t border-line pt-4">
                  <h3 className="type-subtitle">{item.title}</h3>
                  <p className="type-helper mt-1.5 text-ink-muted">{item.detail}</p>
                </div>
              </Reveal>
            ))}
          </ul>
        </Container>
      </section>

      <section className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <Reveal>
            <div className="max-w-2xl">
              <p className="type-eyebrow text-ink-muted">Decision workflow</p>
              <h2 className="type-section mt-2">How the tools work together</h2>
              <p className="type-body mt-2 text-ink-muted">
                Five steps, each a live instrument. Each step works on its own — use the ones your
                trade needs. Nothing here recommends or predicts.
              </p>
            </div>
          </Reveal>

          <ol aria-label="Decision workflow" className="mt-8 grid max-w-3xl gap-0">
            {WORKFLOW.map((item, index) => {
              const tool = TOOLS.find((entry) => entry.id === item.toolId);
              if (tool === undefined) return null;
              const Icon = WORKFLOW_ICONS[item.toolId];
              return (
                <Reveal as="li" key={item.step} delay={Math.min(index, 4) * 60}>
                  <Link
                    href={`/tools/${tool.slug}`}
                    className="group flex items-center gap-4 border-t border-line py-4 last:border-b"
                  >
                    <span className="type-mono w-8 shrink-0 text-ink-faint">{item.step}</span>
                    <span
                      aria-hidden="true"
                      className="hidden size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink-muted sm:flex"
                    >
                      <Icon className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="type-label block text-ink">
                        {item.verb} · {tool.name}
                      </span>
                      <span className="type-helper block text-ink-muted">{item.role}</span>
                    </span>
                    <ArrowRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-ink-faint transition-transform [transition-duration:var(--motion-micro)] group-hover:translate-x-0.5 group-hover:text-primary"
                    />
                  </Link>
                </Reveal>
              );
            })}
          </ol>
        </Container>
      </section>

      <section className="border-b border-line bg-surface-muted/60">
        <Container className="py-12 sm:py-16">
          <Reveal>
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <p className="type-eyebrow text-ink-muted">Live instruments</p>
                <h2 className="type-section mt-2">Five tools you can use today</h2>
                <p className="type-body mt-2 text-ink-muted">
                  Each one does a single job well. Open any of them directly.
                </p>
              </div>
              <Link href="/tools" className={buttonClasses("secondary")}>
                Browse all tools
              </Link>
            </div>
          </Reveal>

          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {liveTools.map((tool, index) => (
              <Reveal as="li" key={tool.id} delay={Math.min(index, 4) * 60} className="h-full">
                <ToolCard tool={tool} />
              </Reveal>
            ))}
          </ul>
        </Container>
      </section>

      <section className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <Reveal>
            <div className="mx-auto max-w-2xl text-center">
              <p className="type-eyebrow text-ink-muted">Product tour</p>
              <h2 className="type-section mt-2">See the real product</h2>
              <p className="type-body mt-2 text-ink-muted">
                Real tools. Real calculations. No simulated dashboards. Each screenshot below is the
                live tool with synthetic illustrative inputs.
              </p>
            </div>
          </Reveal>

          <Reveal className="mt-8" delay={60}>
            <ProductShowcase />
          </Reveal>
        </Container>
      </section>

      <section className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <Reveal>
            <div className="max-w-2xl">
              <h2 className="type-section">The toolkit</h2>
              <p className="type-body mt-2 text-ink-muted">
                Ten focused tools, grouped by the job they do. Each one does a single job well.
              </p>
            </div>
          </Reveal>

          <ul className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TOOL_GROUPS.map((group) => (
              <li key={group.id}>
                <GroupCard group={group} />
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="border-b border-line">
        <Container className="py-12 sm:py-16">
          <Reveal>
            <div className="max-w-2xl">
              <p className="type-eyebrow text-ink-muted">Coming soon</p>
              <h2 className="type-section mt-2">On the bench</h2>
              <p className="type-body mt-2 text-ink-muted">
                Planned tools stay non-interactive until they are live. Nothing here is usable yet.
              </p>
            </div>
          </Reveal>

          <ul className="mt-8 grid grid-cols-1 gap-3 opacity-90 sm:grid-cols-2 lg:grid-cols-3">
            {plannedTools.map((tool) => (
              <li key={tool.id}>
                <ToolCard tool={tool} />
              </li>
            ))}
          </ul>
        </Container>
      </section>

      <section className="border-b border-line bg-surface-muted">
        <Container className="py-12 sm:py-16">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-12">
            <Reveal>
              <p className="type-eyebrow text-ink-muted">Philosophy</p>
              <h2 className="type-section mt-2">Calculations and structure, not signals.</h2>
            </Reveal>

            <ul className="grid gap-6 sm:grid-cols-3">
              {PRINCIPLES.map((item, index) => (
                <Reveal as="li" key={item.title} delay={index * 60}>
                  <h3 className="type-subtitle">{item.title}</h3>
                  <p className="type-helper mt-1.5 text-ink-muted">{item.detail}</p>
                </Reveal>
              ))}
            </ul>
          </div>

          {trustRow !== undefined ? (
            <Reveal className="mt-10 max-w-3xl">
              <h3 className="type-subtitle">Inside every calculation</h3>
              <p className="type-helper mt-1.5 text-ink-muted">
                Illustrative example — not market data. Calculated by the StrikeLens engine from
                fixed inputs, shown the way every tool receipts its results.
              </p>
              <Card className="mt-4 [&_dd]:min-w-0 [&_dd]:shrink">
                <ReceiptSection title="Inputs">
                  <ReceiptRow term="Spot" value={formatDemoPaise(TRUST_DEMO_INPUT.spotPaise)} />
                  <ReceiptRow term="Option type" value="CE (Call)" />
                  <ReceiptRow
                    term="Strike"
                    value={formatDemoPaise(TRUST_DEMO_INPUT.rows[0]?.strikePaise ?? 0)}
                  />
                  <ReceiptRow
                    term="Premium"
                    value={formatDemoPaise(TRUST_DEMO_INPUT.rows[0]?.premiumPaise ?? 0)}
                  />
                </ReceiptSection>
                <ReceiptSection title="Method">
                  <ReceiptRow term="Moneyness" value={trustRow.moneyness} />
                  <ReceiptRow
                    term="Distance from spot"
                    value={`${trustRow.distancePaise > 0 ? "+" : ""}${formatDemoPaise(trustRow.distancePaise)} (${(trustRow.distanceBps / 100).toFixed(2)}%)`}
                  />
                </ReceiptSection>
                <ReceiptSection title="Outputs">
                  <ReceiptRow
                    term="Intrinsic value"
                    value={formatDemoPaise(trustRow.intrinsicPaise)}
                  />
                  <ReceiptRow
                    term="Extrinsic value"
                    value={formatDemoPaise(trustRow.extrinsicPaise)}
                  />
                  <ReceiptRow
                    term="Option breakeven"
                    value={formatDemoPaise(trustRow.breakevenPaise)}
                  />
                </ReceiptSection>
                <ReceiptSection title="Rounding">
                  <ReceiptRow term="Rounding" value={STRIKE_LENS_ROUNDING_NOTE} />
                </ReceiptSection>
                <ReceiptSection title="Limits">
                  <ReceiptRow
                    term="Illustrative scope"
                    value="One fixed example — not market data"
                  />
                  <ReceiptRow term="Transaction costs" value="Excluded" />
                  <ReceiptRow term="Expiry basis" value="Long expiry payoff" />
                </ReceiptSection>
                <p className="type-caption mt-3 text-ink-muted">
                  {STRIKE_LENS_FORMULA_ID} · StrikeLens calculation basis
                </p>
                <Link
                  href="/tools/strike-lens"
                  className="type-label mt-3 inline-flex min-h-11 items-center text-primary underline underline-offset-4"
                >
                  Open StrikeLens
                </Link>
              </Card>
              <p className="type-helper mt-4 text-ink-muted">
                Each tool shows its own calculation basis — including dated statutory rate sets
                where applicable and model assumptions where applicable.
              </p>
            </Reveal>
          ) : null}
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
