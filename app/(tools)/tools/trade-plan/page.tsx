import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { ToolCrumbs } from "@/components/layout/tool-crumbs";
import { ToolSwitcher } from "@/components/tools/tool-switcher";
import { Callout } from "@/components/ui/callout";
import { TradePlanChecker } from "@/features/trade-plan/components/trade-plan-checker";

export const metadata: Metadata = {
  title: "TradePlan",
  description:
    "Define a trade before taking it: setup, entry, stop, target and invalidation, with a coherence check and transparent plan receipt. No broker login or market data needed.",
};

export default function TradePlanPage() {
  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Plan & Risk"
        title="TradePlan"
        description="State what you are trading and why, set where you enter, where you are wrong and where you take profit. TradePlan checks the plan is internally coherent and shows every number behind the check."
      />

      <div className="mt-4 space-y-4">
        <ToolCrumbs toolId="trade-plan" />
        <ToolSwitcher currentId="trade-plan" />
      </div>

      <div className="mt-8">
        <TradePlanChecker />
      </div>

      <Callout title="Scope" className="mt-10">
        TradePlan validates the plan you describe. It does not place orders, connect to a broker, or
        provide buy and sell recommendations. Not investment advice.
      </Callout>
    </Container>
  );
}
