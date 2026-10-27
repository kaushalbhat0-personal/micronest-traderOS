import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Callout } from "@/components/ui/callout";
import { TradeCostCalculator } from "@/features/trade-cost/components/trade-cost-calculator";
import { parseHandoffParams } from "@/features/trade-cost/validation";

export const metadata: Metadata = {
  title: "TradeCost",
  description:
    "Estimate what transaction costs do to a planned NSE cash-equity trade: gross P&L, charges, net P&L and breakeven. No broker login or market data needed.",
};

export default async function TradeCostPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Ephemeral handoff from RiskGuard: only direction/entry/target/quantity are
  // accepted, each re-validated at the TradeCost boundary. Nothing is stored.
  const handoff = parseHandoffParams((await searchParams) ?? {});

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Plan & Risk"
        title="TradeCost"
        description="Enter your buy and sell prices, quantity and brokerage assumption. TradeCost estimates gross P&L, every transaction charge, net P&L and the breakeven exit — and shows every number behind the estimate."
      />

      <div className="mt-8">
        <TradeCostCalculator initialFields={handoff} />
      </div>

      <Callout title="Scope" className="mt-10">
        TradeCost estimates NSE cash-equity transaction costs from your own numbers. It does not
        place orders, connect to a broker, or provide buy and sell recommendations. DP charges,
        slippage and penalties are excluded. Not investment advice.
      </Callout>
    </Container>
  );
}
