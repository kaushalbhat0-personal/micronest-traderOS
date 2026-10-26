import { Check } from "lucide-react";
import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
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

function PriceRows({ planId }: { planId: PlanId }) {
  return (
    <dl className="space-y-2">
      {BILLING_INTERVALS.map((interval) => {
        const price = getPrice(planId, interval);

        if (!price) {
          return null;
        }

        return (
          <div
            key={interval}
            className="flex items-baseline justify-between gap-3 border-t border-line pt-2 first:border-t-0 first:pt-0"
          >
            <dt className="text-sm text-ink-muted">{INTERVAL_LABEL[interval].label}</dt>
            <dd className="text-right">
              <span className="tnum text-base font-semibold">
                {formatInrFromPaise(price.amountPaise)}
              </span>
              <span className="ml-1 text-xs text-ink-muted">{INTERVAL_LABEL[interval].suffix}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function PlanCard({ planId }: { planId: PlanId }) {
  const plan = PLANS[planId];
  const isFree = plan.id === "free";

  return (
    <article
      aria-labelledby={`plan-${plan.id}`}
      className={cn(
        "flex h-full flex-col rounded-xl border bg-surface p-5",
        plan.highlighted ? "border-primary/30" : "border-line",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id={`plan-${plan.id}`} className="text-lg font-semibold tracking-tight">
            {plan.name}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-muted">{plan.tagline}</p>
        </div>
        {plan.highlighted ? (
          <span className="shrink-0 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary">
            Most complete
          </span>
        ) : null}
      </div>

      <div className="mt-5">
        {isFree ? (
          <div className="flex items-baseline justify-between border-t border-line pt-3">
            <span className="text-sm text-ink-muted">Price</span>
            <span className="text-base font-semibold">Free</span>
          </div>
        ) : (
          <PriceRows planId={plan.id} />
        )}
      </div>

      <ul className="mt-5 space-y-2 text-sm">
        {plan.features.map((feature) => (
          <li key={feature} className="flex gap-2">
            <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ok" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto pt-6">
        {isFree ? (
          <p className="text-xs text-ink-muted">Available when the first tool opens.</p>
        ) : (
          <>
            <Button disabled className="w-full" aria-describedby={`plan-${plan.id}-status`}>
              Not yet available
            </Button>
            <p id={`plan-${plan.id}-status`} className="mt-2 text-center text-xs text-ink-muted">
              Checkout opens at launch.
            </p>
          </>
        )}
      </div>
    </article>
  );
}

export default function PricingPage() {
  return (
    <Container className="py-10 sm:py-12">
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

      <section
        aria-labelledby="founding"
        className="mt-8 rounded-xl border border-primary/25 bg-surface p-5 sm:p-6"
      >
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="founding" className="text-lg font-semibold tracking-tight">
            {FOUNDING_COHORT.name}
          </h2>
          <span className="rounded-full border border-warn/30 bg-warn/10 px-2.5 py-1 text-xs font-medium text-warn-strong">
            First {FOUNDING_COHORT.seats} customers
          </span>
        </div>

        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-muted">
          {FOUNDING_COHORT.description}
        </p>

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {BILLING_INTERVALS.map((interval) => {
            const price = getPrice(FOUNDING_COHORT.entitlementPlanId, interval, FOUNDING_COHORT.id);

            return (
              <div key={interval} className="rounded-lg border border-line bg-surface-muted p-3">
                <dt className="text-xs text-ink-muted">{INTERVAL_LABEL[interval].label}</dt>
                <dd className="mt-1">
                  <span className="tnum text-lg font-semibold">
                    {price ? formatInrFromPaise(price.amountPaise) : "—"}
                  </span>
                  <span className="ml-1 text-xs text-ink-muted">
                    {INTERVAL_LABEL[interval].suffix}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>

        <p className="mt-3 text-xs text-ink-muted">
          Same entitlements as {PLANS[FOUNDING_COHORT.entitlementPlanId].name}. Founding pricing is
          a price cohort, not a separate plan.
        </p>
      </section>

      <Callout title="Before launch" className="mt-8">
        Prices are shown in INR for planning. Checkout, applicable taxes and payment processing will
        be confirmed when billing opens. Plan entitlements are provisional until launch.
      </Callout>
    </Container>
  );
}
