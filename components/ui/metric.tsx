import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Canonical result metric — the single visual hierarchy for a tool's primary
 * result figure.
 *
 * Presentation only: `value` (and optional `supporting`/`caption`) must be
 * already-formatted display strings produced by the calling tool. This
 * component never parses, formats from raw input, or calculates anything.
 *
 * Concept:
 * ```
 * [Value]
 * [Unit / supporting value]
 * [Caption]
 * ```
 */
export type MetricProps = {
  /** Already-formatted primary figure, e.g. `formatPaise(netPnlPaise)`. */
  value: ReactNode;
  /** Unit or supporting value on the same line, e.g. `units · 3 lots`. */
  supporting?: ReactNode;
  /** Small caption below the figure, e.g. `Model value`. */
  caption?: ReactNode;
  className?: string;
};

export function Metric({ value, supporting, caption, className }: MetricProps) {
  return (
    <div className={cn("mt-1 min-w-0", className)}>
      <p className="type-metric tnum break-words text-ink">
        {value}
        {supporting ? (
          <>
            {" "}
            <span className="type-helper font-normal text-ink-muted">{supporting}</span>
          </>
        ) : null}
      </p>
      {caption ? <p className="type-caption mt-1 text-ink-muted">{caption}</p> : null}
    </div>
  );
}
