import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Callout } from "@/components/ui/callout";
import { StrikeLensComparison } from "@/features/strike-lens/components/strike-lens-comparison";
import { parseHandoffParams } from "@/features/strike-lens/validation";

export const metadata: Metadata = {
  title: "StrikeLens",
  description:
    "Compare option strikes on premium, moneyness, intrinsic and extrinsic value, distance and breakeven. No broker login or market data needed.",
};

export default async function StrikeLensPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Ephemeral handoff: only the spot price is accepted, re-validated at the
  // StrikeLens boundary. Nothing is stored.
  const handoff = parseHandoffParams((await searchParams) ?? {});

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Options"
        title="StrikeLens"
        description="Enter a spot price and up to five strikes of the same type. StrikeLens compares moneyness, value split, distance and breakeven — and shows every number behind the comparison."
      />

      <div className="mt-8">
        <StrikeLensComparison initialFields={handoff} />
      </div>

      <Callout title="Scope" className="mt-10">
        StrikeLens compares option strikes from your own numbers. It does not fetch market data,
        place orders, connect to a broker, or provide buy and sell recommendations. Option
        transaction costs are not modelled here — verify with your broker. Not investment advice.
      </Callout>
    </Container>
  );
}
