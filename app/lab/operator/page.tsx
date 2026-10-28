import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { Metadata } from "next";

import { OperatorView } from "@/app/lab/operator/operator-view";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Callout } from "@/components/ui/callout";
import { validateDataset } from "@/features/strategy-lab/dataset";
import type { Bar } from "@/features/strategy-lab/types";

export const metadata: Metadata = {
  title: "Strategy Lab Operator",
  description:
    "Manual ₹0 paper-trading operator: step the deterministic market simulator one synthetic bar at a time. Simulation with fictional cash — not live trading.",
};

/**
 * `/lab/operator` — M3-1 manual operator surface. A thin server wrapper that
 * loads the frozen synthetic fixture through M1-A validation and hands the
 * plain bars to the client island. No fetching, no polling, no timers, no
 * persistence — the island advances one deterministic `streamEmitNext`
 * transition per explicit user action.
 */
function loadOperatorBars(): { status: "ok"; bars: Bar[] } | { status: "invalid"; reason: string } {
  let csvText: string;
  let manifestRaw: unknown;
  try {
    const dir = join(process.cwd(), "features", "strategy-lab", "fixtures");
    csvText = readFileSync(join(dir, "sample-bars.csv"), "utf8");
    manifestRaw = JSON.parse(readFileSync(join(dir, "sample-bars.manifest.json"), "utf8"));
  } catch {
    return { status: "invalid", reason: "The synthetic fixture files could not be read." };
  }
  const validated = validateDataset(csvText, manifestRaw);
  if (validated.status !== "ok") {
    return { status: "invalid", reason: "The synthetic fixture failed M1-A dataset validation." };
  }
  return { status: "ok", bars: [...validated.bars] };
}

export default function StrategyLabOperatorPage() {
  const loaded = loadOperatorBars();

  if (loaded.status === "invalid") {
    return (
      <Container className="py-10 sm:py-14">
        <PageHeader
          eyebrow="Paper simulation"
          title="Manual Operator"
          description="Step the deterministic simulator — synthetic data, fictional cash"
        />
        <Callout tone="danger" title="Simulation unavailable" className="mt-7">
          {`${loaded.reason} No figures are shown rather than estimated ones.`}
        </Callout>
      </Container>
    );
  }

  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Paper simulation"
        title="Manual Operator"
        description="Step the deterministic simulator — synthetic data, fictional cash"
      />
      <div className="mt-7">
        <OperatorView bars={loaded.bars} />
      </div>
    </Container>
  );
}
