import type { Paise } from "@/types/domain";

/**
 * Pricing is product configuration, never JSX copy.
 *
 * All amounts are integer paise. Founding pricing is a *cohort* attached to
 * All Access, not a fourth entitlement plan.
 */

export const PLAN_IDS = ["free", "individual_pro", "all_access"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const BILLING_INTERVALS = ["month", "year"] as const;
export type BillingInterval = (typeof BILLING_INTERVALS)[number];

export const PRICE_COHORTS = ["standard", "founding"] as const;
export type PriceCohort = (typeof PRICE_COHORTS)[number];

export type PlanDefinition = {
  id: PlanId;
  name: string;
  tagline: string;
  /** Provisional launch entitlements, shown on the pricing page. */
  features: readonly string[];
  highlighted?: boolean;
};

export type PriceEntry = {
  planId: PlanId;
  interval: BillingInterval;
  amountPaise: Paise;
  cohort: PriceCohort;
};

export type FoundingCohort = {
  id: Extract<PriceCohort, "founding">;
  name: string;
  seats: number;
  /** Founding customers receive these plan entitlements. */
  entitlementPlanId: PlanId;
  description: string;
};

export const PLANS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    tagline: "Try every tool with sensible limits.",
    features: [
      "Basic access to every tool",
      "Daily usage limits",
      "Limited history",
      "No advanced exports",
    ],
  },
  individual_pro: {
    id: "individual_pro",
    name: "Individual Pro",
    tagline: "For one trader who wants room to work.",
    features: [
      "Everything in Free",
      "Higher usage limits",
      "Extended history",
      "Advanced exports when available",
    ],
  },
  all_access: {
    id: "all_access",
    name: "All Access",
    tagline: "The full toolkit, with the highest limits.",
    features: [
      "Everything in Individual Pro",
      "Highest usage limits",
      "Full history",
      "Early access to new tools",
    ],
    highlighted: true,
  },
};

export const PRICE_BOOK: readonly PriceEntry[] = [
  { planId: "individual_pro", interval: "month", amountPaise: 19_900, cohort: "standard" },
  { planId: "individual_pro", interval: "year", amountPaise: 199_900, cohort: "standard" },
  { planId: "all_access", interval: "month", amountPaise: 59_900, cohort: "standard" },
  { planId: "all_access", interval: "year", amountPaise: 499_900, cohort: "standard" },
  { planId: "all_access", interval: "month", amountPaise: 39_900, cohort: "founding" },
  { planId: "all_access", interval: "year", amountPaise: 399_900, cohort: "founding" },
];

export const FOUNDING_COHORT: FoundingCohort = {
  id: "founding",
  name: "Founding offer",
  seats: 100,
  entitlementPlanId: "all_access",
  description:
    "Founding pricing for the first 100 customers. Same All Access entitlements, lower price.",
};

export function getPrice(
  planId: PlanId,
  interval: BillingInterval,
  cohort: PriceCohort = "standard",
): PriceEntry | undefined {
  return PRICE_BOOK.find(
    (entry) => entry.planId === planId && entry.interval === interval && entry.cohort === cohort,
  );
}
