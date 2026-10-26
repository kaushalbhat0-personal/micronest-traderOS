import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ToolDefinition } from "@/config/tools";

export function ToolCard({ tool }: { tool: ToolDefinition }) {
  return (
    <Card className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold tracking-tight">{tool.name}</h3>
        <StatusBadge status={tool.status} />
      </div>
      <p className="text-sm leading-relaxed text-ink-muted">{tool.summary}</p>
    </Card>
  );
}
