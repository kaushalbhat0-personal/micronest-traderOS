import { Circle, CircleCheck, Clock3 } from "lucide-react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import type { ToolStatus } from "@/config/tools";

/**
 * Semantic status mapping. Labels are always rendered as text so status is
 * never conveyed by colour alone.
 */
const STATUS: Record<ToolStatus, { label: string; icon: typeof Circle; tone: BadgeTone }> = {
  live: { label: "Live", icon: CircleCheck, tone: "ok" },
  coming_soon: { label: "Coming soon", icon: Clock3, tone: "warn" },
  planned: { label: "Planned", icon: Circle, tone: "neutral" },
};

export function StatusBadge({ status }: { status: ToolStatus }) {
  const { label, icon, tone } = STATUS[status];

  return (
    <Badge tone={tone} icon={icon}>
      {label}
    </Badge>
  );
}
