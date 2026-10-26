import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Callout } from "@/components/ui/callout";
import { RiskGuardCalculator } from "@/features/risk-guard/components/risk-guard-calculator";

export const metadata: Metadata = {
  title: "RiskGuard",
  description:
    "Check a trade against your own risk budget: allowed quantity, per-unit risk and a transparent calculation receipt. No broker login or market data needed.",
};

export default function RiskGuardPage() {
  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Plan & Risk"
        title="RiskGuard"
        description="Enter your capital, risk %, direction, entry, stop and lot size. RiskGuard checks whether the trade fits your own risk budget and shows every number behind the decision."
      />

      <div className="mt-8">
        <RiskGuardCalculator />
      </div>

      <Callout title="Scope" className="mt-10">
        RiskGuard calculates position size from the numbers you enter. It does not place orders,
        connect to a broker, or provide buy and sell recommendations. Not investment advice.
      </Callout>
    </Container>
  );
}
