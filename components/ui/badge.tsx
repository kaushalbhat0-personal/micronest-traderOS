import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type BadgeTone = "neutral" | "primary" | "ok" | "warn" | "danger";

/**
 * Tones are the single source of truth for pill colour. `ok`/`warn` use the
 * AA-safe text variants because badge text is 12px.
 */
const TONES: Record<BadgeTone, string> = {
  neutral: "border-line bg-surface-muted text-ink-muted",
  primary: "border-primary/25 bg-primary/5 text-primary",
  ok: "border-ok/30 bg-ok/10 text-ok-strong",
  warn: "border-warn/30 bg-warn/10 text-warn-strong",
  danger: "border-danger/30 bg-danger/10 text-danger",
};

export type BadgeProps = {
  tone?: BadgeTone;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
};

export function Badge({ tone = "neutral", icon: Icon, children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "type-caption inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium",
        TONES[tone],
        className,
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3.5" /> : null}
      {children}
    </span>
  );
}
