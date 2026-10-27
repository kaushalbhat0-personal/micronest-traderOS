import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { ToolCrumbs } from "@/components/layout/tool-crumbs";
import { ToolSwitcher } from "@/components/tools/tool-switcher";
import { Callout } from "@/components/ui/callout";
import { GreekMapAnalyzer } from "@/features/greek-map/components/greek-map-analyzer";
import { parseHandoffParams } from "@/features/greek-map/validation";

export const metadata: Metadata = {
  title: "GreekMap",
  description:
    "Type one option's inputs and see its model price and Greeks across fixed spot and time scenarios. No broker login or market data needed.",
};

export default async function GreekMapPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Ephemeral handoff from StrikeLens: only type, strike and spot are
  // accepted, each re-validated at the GreekMap boundary. Nothing is stored.
  const handoff = parseHandoffParams((await searchParams) ?? {});

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Options"
        title="GreekMap"
        description="Type one option's price inputs and see its model price and Greeks, plus fixed spot and time scenarios. GreekMap illustrates your assumptions — it never judges a strike or a strategy."
      />

      <div className="mt-4 space-y-4">
        <ToolCrumbs toolId="greek-map" />
        <ToolSwitcher currentId="greek-map" />
      </div>

      <div className="mt-8">
        <GreekMapAnalyzer initialFields={handoff} />
      </div>

      <Callout title="Scope" className="mt-10">
        GreekMap prices a European option from your own numbers with Black-Scholes-Merton. It does
        not fetch market data, place orders, connect to a broker, or provide buy and sell
        recommendations. Not investment advice.
      </Callout>
    </Container>
  );
}
