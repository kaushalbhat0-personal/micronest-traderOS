import { Check } from "lucide-react";
import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import {
  BILLING_INTERVALS,
  FOUNDING_COHORT,
  PLANS,
  PLAN_IDS,
  getPrice,
  type BillingInterval,
  type PlanId,
} from "@/config/plans";
import { formatInrFromPaise } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "MicroNest Trader OS pricing: Free, Individual Pro, All Access, and a founding offer for the first 100 customers.",
};

const INTERVAL_LABEL: Record<BillingInterval, { label: string; suffix: string }> = {
  month: { label: "Monthly", suffix: "per month" },
  year: { label: "Yearly", suffix: "per year" },
};

/** Monthly is the headline figure; the yearly option stays visible beside it. */
function PlanPrice({ planId }: { planId: PlanId }) {
  const monthly = getPrice(planId, "month");
  const yearly = getPrice(planId, "year");

  if (!monthly || !yearly) {
    return null;
  }

  return (
    <div className="space-y-1 border-t border-line pt-4">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span className="type-metric">{formatInrFromPaise(monthly.amountPaise)}</span>
        <span className="type-caption text-ink-muted">{INTERVAL_LABEL.month.suffix}</span>
      </p>
      <p className="type-helper text-ink-muted">
        or{" "}
        <span className="tnum font-medium text-ink">{formatInrFromPaise(yearly.amountPaise)}</span>{" "}
        {INTERVAL_LABEL.year.suffix}
      </p>
    </div>
  );
}

function PlanCard({ planId }: { planId: PlanId }) {
  const plan = PLANS[planId];
  const isFree = plan.id === "free";

  return (
    <Card
      as="article"
      aria-labelledby={`plan-${plan.id}`}
      className={cn("flex h-full flex-col", plan.highlighted && "border-primary/30")}
    >
      {/* The name row wraps instead of squeezing the heading, so a long plan
          name never collapses into a narrow column at three-across widths. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <h2 id={`plan-${plan.id}`} className="type-section">
          {plan.name}
        </h2>
        {plan.highlighted ? <Badge tone="primary">Most complete</Badge> : null}
      </div>

      {/* Price sits directly under the name so the comparison figure lines up
          across plans; the tagline follows, where its length cannot shift it. */}
      <div className="mt-4">
        {isFree ? (
          <div className="flex flex-wrap items-baseline gap-x-2 border-t border-line pt-4">
            <span className="type-metric">{formatInrFromPaise(0)}</span>
            <span className="type-caption text-ink-muted">no card required at launch</span>
          </div>
        ) : (
          <PlanPrice planId={plan.id} />
        )}
      </div>

      <p className="type-helper mt-3 text-ink-muted">{plan.tagline}</p>

      <ul className="mt-5 space-y-2">
        {plan.features.map((feature) => (
          <li key={feature} className="type-helper flex gap-2">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ok" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        {isFree ? (
          <p className="type-caption text-ink-muted">Available when the first tool opens.</p>
        ) : (
          <>
            <Button disabled className="w-full" aria-describedby={`plan-${plan.id}-status`}>
              Not yet available
            </Button>
            <p
              id={`plan-${plan.id}-status`}
              className="type-caption mt-2 text-center text-ink-muted"
            >
              Checkout opens at launch.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

export default function PricingPage() {
  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Plans"
        title="Pricing"
        description="Start free when the first tool opens. Paid plans add higher limits, longer history and exports when available."
      />

      <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLAN_IDS.map((planId) => (
          <PlanCard key={planId} planId={planId} />
        ))}
      </div>

      <Card as="section" aria-labelledby="founding" className="mt-4 border-primary/25 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="founding" className="type-section">
            {FOUNDING_COHORT.name}
          </h2>
          <Badge>First {FOUNDING_COHORT.seats} customers</Badge>
        </div>

        <p className="type-helper mt-2 max-w-2xl text-ink-muted">{FOUNDING_COHORT.description}</p>

        <dl className="mt-5 flex flex-col gap-4 border-t border-line pt-4 sm:flex-row sm:gap-16">
          {BILLING_INTERVALS.map((interval) => {
            const price = getPrice(FOUNDING_COHORT.entitlementPlanId, interval, FOUNDING_COHORT.id);

            return (
              <div key={interval}>
                <dt className="type-caption text-ink-muted">{INTERVAL_LABEL[interval].label}</dt>
                <dd className="mt-1 flex flex-wrap items-baseline gap-x-2">
                  <span className="type-metric">
                    {price ? formatInrFromPaise(price.amountPaise) : "—"}
                  </span>
                  <span className="type-caption text-ink-muted">
                    {INTERVAL_LABEL[interval].suffix}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>

        <p className="type-caption mt-4 text-ink-muted">
          Same entitlements as {PLANS[FOUNDING_COHORT.entitlementPlanId].name}. Founding pricing is
          a price cohort, not a separate plan.
        </p>
      </Card>

      <Callout title="Before launch" className="mt-8">
        Prices are shown in INR for planning. Checkout, applicable taxes and payment processing will
        be confirmed when billing opens. Plan entitlements are provisional until launch.
      </Callout>
    </Container>
  );
}
