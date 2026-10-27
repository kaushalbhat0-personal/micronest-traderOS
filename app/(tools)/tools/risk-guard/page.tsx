import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { ToolCrumbs } from "@/components/layout/tool-crumbs";
import { ToolSwitcher } from "@/components/tools/tool-switcher";
import { Callout } from "@/components/ui/callout";
import { RiskGuardCalculator } from "@/features/risk-guard/components/risk-guard-calculator";
import { parseHandoffParams } from "@/features/risk-guard/validation";

export const metadata: Metadata = {
  title: "RiskGuard",
  description:
    "Check a trade against your own risk budget: allowed quantity, per-unit risk and a transparent calculation receipt. No broker login or market data needed.",
};

export default async function RiskGuardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Ephemeral handoff from TradePlan: only direction/entry/stop/target are
  // accepted, each re-validated at the RiskGuard boundary. Nothing is stored.
  const handoff = parseHandoffParams((await searchParams) ?? {});

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Plan & Risk"
        title="RiskGuard"
        description="Enter your capital, risk %, direction, entry, stop and lot size. RiskGuard checks whether the trade fits your own risk budget and shows every number behind the decision."
      />

      <div className="mt-4 space-y-4">
        <ToolCrumbs toolId="risk-guard" />
        <ToolSwitcher currentId="risk-guard" />
      </div>

      <div className="mt-8">
        <RiskGuardCalculator initialFields={handoff} />
      </div>

      <Callout title="Scope" className="mt-10">
        RiskGuard calculates position size from the numbers you enter. It does not place orders,
        connect to a broker, or provide buy and sell recommendations. Not investment advice.
      </Callout>
    </Container>
  );
}
