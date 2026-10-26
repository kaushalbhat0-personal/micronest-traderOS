import { CircleCheck, Info, ShieldAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type CalloutTone = "info" | "success" | "warn" | "danger";

const TONES: Record<CalloutTone, { icon: typeof Info; container: string; iconClassName: string }> =
  {
    info: {
      icon: Info,
      container: "border-line bg-surface-muted",
      iconClassName: "text-info",
    },
    success: {
      icon: CircleCheck,
      container: "border-ok/30 bg-ok/5",
      iconClassName: "text-ok",
    },
    warn: {
      icon: TriangleAlert,
      container: "border-warn/30 bg-warn/5",
      iconClassName: "text-warn",
    },
    danger: {
      icon: ShieldAlert,
      container: "border-danger/30 bg-danger/5",
      iconClassName: "text-danger",
    },
  };

export type CalloutProps = {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
  className?: string;
};

export function Callout({ tone = "info", title, children, className }: CalloutProps) {
  const { icon: Icon, container, iconClassName } = TONES[tone];

  return (
    <div role="note" className={cn("flex gap-3 rounded-xl border p-4", container, className)}>
      <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", iconClassName)} />
      <div className="min-w-0 space-y-1">
        {title ? <p className="type-label text-ink">{title}</p> : null}
        <div className="type-helper text-ink-muted">{children}</div>
      </div>
    </div>
  );
}
