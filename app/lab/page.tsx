import type { Metadata } from "next";

import { StrategyLabReportView } from "@/app/lab/report-view";
import { loadStrategyLabReport } from "@/app/lab/report";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Callout } from "@/components/ui/callout";

export const metadata: Metadata = {
  title: "Strategy Lab",
  description:
    "Read-only deterministic research report: OOS headline, IS/OOS comparison, slippage sensitivity, and trade evidence on a synthetic fixture. Not a trading signal.",
};

/**
 * `/lab` — the M1-F read-only Strategy Lab research report. A static server
 * route over the frozen M1 pipeline: it loads the deterministic fixture result
 * and renders it. No API routes, no fetching, no interactivity, no mutations.
 */
export default function StrategyLabPage() {
  const report = loadStrategyLabReport();

  if (report.status === "invalid") {
    return (
      <Container className="py-10 sm:py-14">
        <PageHeader
          eyebrow="Research report"
          title="Strategy Lab"
          description="Deterministic historical research — not a trading signal"
        />
        <Callout tone="danger" title="Research unavailable" className="mt-7">
          {`${report.reason} No figures are shown rather than estimated ones.`}
        </Callout>
      </Container>
    );
  }

  return <StrategyLabReportView report={report} />;
}
