import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { ToolGrid } from "@/components/tools/tool-grid";
import { Callout } from "@/components/ui/callout";
import { TOOL_GROUPS } from "@/config/tools";

export const metadata: Metadata = {
  title: "Tools",
  description:
    "Ten focused microtools for planning, sizing, analysing and reviewing trades. Statuses show what is actually available.",
};

const JUMP_LINK_CLASS =
  "type-label inline-flex min-h-11 items-center rounded-lg border border-line bg-surface px-3 text-ink transition-colors hover:bg-surface-muted";

export default function ToolsPage() {
  return (
    <Container className="py-10 sm:py-14">
      <PageHeader
        eyebrow="Toolkit"
        title="Tools"
        description="Ten focused tools, grouped by the job they do. RiskGuard and TradePlan are live; the rest are in development."
      />

      <nav aria-label="Tool groups" className="mt-7">
        <ul className="flex flex-wrap gap-2">
          {TOOL_GROUPS.map((group) => (
            <li key={group.id}>
              <a href={`#group-${group.id}`} className={JUMP_LINK_CLASS}>
                {group.name}
              </a>
            </li>
          ))}
        </ul>
      </nav>

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
