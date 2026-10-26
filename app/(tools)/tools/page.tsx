import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { ToolGrid } from "@/components/tools/tool-grid";
import { Callout } from "@/components/ui/callout";
import { StatusBadge } from "@/components/ui/status-badge";

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Ten focused microtools for planning, sizing, analysing and reviewing trades. Statuses show what is actually available.",
};

const LEGEND = [
  { status: "live", label: "Available now" },
  { status: "coming_soon", label: "In development" },
  { status: "planned", label: "Planned" },
] as const;

export default function ToolsPage() {
  return (
    <Container className="py-10 sm:py-12">
      <PageHeader
        eyebrow="Toolkit"
        title="Tools"
        description="Ten focused tools, grouped by the job they do. Nothing is live yet; RiskGuard is the first tool in development."
      />

      <ul className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
        {LEGEND.map((item) => (
          <li key={item.status} className="flex items-center gap-2">
            <StatusBadge status={item.status} />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>

      <div className="mt-10">
        <ToolGrid />
      </div>

      <Callout title="Scope" className="mt-10">
        These tools calculate, organise and review what you enter. They do not place orders, connect
        to a broker, or provide buy and sell recommendations.
      </Callout>
    </Container>
  );
}
