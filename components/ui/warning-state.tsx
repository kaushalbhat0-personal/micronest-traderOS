import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shared factual-warning treatment for genuine engine-reported warnings
 * (inconsistent premium, blocked-calculation reason context, model
 * limitation, omitted scenario). Presentation only: the calling tool passes
 * the engine's existing message verbatim and computes nothing here.
 *
 * Uses `role="alert"` because these warnings appear with the result and must
 * be announced. No animation, no recommendation language — the message text
 * stays exactly as the domain produced it.
 */
export type WarningStateProps = {
  /** Verbatim engine message. Never rewritten here. */
  message: ReactNode;
  /** Optional short heading above the message. */
  title?: ReactNode;
  className?: string;
};

export function WarningState({ message, title, className }: WarningStateProps) {
  return (
    <div role="alert" className={cn("rounded-lg border border-warn/30 bg-warn/5 p-3", className)}>
      {title ? <p className="type-label text-warn-strong">{title}</p> : null}
      <p className={cn("type-helper font-medium text-warn-strong", title ? "mt-0.5" : null)}>
        {message}
      </p>
    </div>
  );
}
