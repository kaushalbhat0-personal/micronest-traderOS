import { Circle, CircleCheck, Clock3 } from "lucide-react";
import type { ToolStatus } from "@/config/tools";
import { cn } from "@/lib/utils";

const STATUS: Record<ToolStatus, { label: string; icon: typeof Circle; className: string }> = {
  live: {
    label: "Live",
    icon: CircleCheck,
    className: "border-ok/30 bg-ok/10 text-ok-strong",
  },
  coming_soon: {
    label: "Coming soon",
    icon: Clock3,
    className: "border-warn/30 bg-warn/10 text-warn-strong",
  },
  planned: {
    label: "Planned",
    icon: Circle,
    className: "border-line bg-surface-muted text-ink-muted",
  },
};

export function StatusBadge({ status }: { status: ToolStatus }) {
  const { label, icon: Icon, className } = STATUS[status];

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}
