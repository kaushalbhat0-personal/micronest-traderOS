import {
  Activity,
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

import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { Tool, ToolId } from "@/config/tools";

/**
 * Icon identity per tool. Presentation lives with the presentation component,
 * not in config. The record is keyed by the derived `ToolId` union, so adding
 * a tool without choosing an icon fails typecheck.
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

export function ToolCard({ tool }: { tool: Tool }) {
  const Icon = TOOL_ICONS[tool.id];

  return (
    <Card className="flex h-full flex-col">
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
      </div>
    </Card>
  );
}
