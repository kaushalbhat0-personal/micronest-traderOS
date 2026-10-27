import {
  Activity,
  ArrowRight,
  ClipboardList,
  GitBranch,
  Layers,
  ListChecks,
  NotebookPen,
  Receipt,
  ShieldCheck,
  Target,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";

import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tool, ToolId } from "@/config/tools";

/**
 * Icon identity per tool. Presentation lives with the presentation component,
 * not in config. The record is keyed by the derived `ToolId` union, so adding
 * a tool without choosing an icon is a type error.
 */
const TOOL_ICONS: Record<ToolId, LucideIcon> = {
  "risk-guard": ShieldCheck,
  "trade-plan": ClipboardList,
  "trade-cost": Receipt,
  "strike-lens": Target,
  "greek-map": Activity,
  "oi-mapper": Layers,
  "structure-map": GitBranch,
  "setup-score": ListChecks,
  "leak-detector": TriangleAlert,
  "review-os": NotebookPen,
};

/**
 * Live cards are one native link: a single accessible name, a single focus
 * target, Enter to navigate. Planned cards stay plain surfaces — no href, no
 * hover choreography, no fake destination.
 */
export function ToolCard({ tool }: { tool: Tool }) {
  const Icon = TOOL_ICONS[tool.id];

  const inner = (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface-muted text-ink-muted"
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1.5">
          <h3 className="type-subtitle">{tool.name}</h3>
          <StatusBadge status={tool.status} />
        </div>
        <p className="type-helper mt-1.5 text-ink-muted">{tool.summary}</p>
      </div>

      {tool.status === "live" ? (
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-surface text-ink-faint transition-colors group-hover:border-primary/40 group-hover:text-primary"
        >
          <ArrowRight className="size-4" />
        </span>
      ) : null}
    </div>
  );

  if (tool.status !== "live") {
    return <Card className="flex h-full flex-col">{inner}</Card>;
  }

  return (
    <Link href={`/tools/${tool.slug}`} className="group block h-full rounded-xl">
      <Card className="h-full transition-colors hover:border-line-strong hover:bg-surface-raised hover:shadow-2 active:shadow-1">
        {inner}
      </Card>
    </Link>
  );
}
