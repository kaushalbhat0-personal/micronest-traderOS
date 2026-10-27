import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Consistent receipt presentation structure shared by all five live tools.
 *
 * Presentation only: every term/value/message is passed in by the calling
 * tool from its existing result object. Nothing is calculated, reformulated,
 * or invented here — sections only group rows the tool already renders.
 *
 * Preferred visual order inside a receipt:
 * 1. Inputs — echoed validated inputs
 * 2. Method — formulas and model provenance
 * 3. Outputs — derived figures already shown above
 * 4. Rounding — the tool's rounding note
 * 5. Limits — exclusions and model boundaries
 * 6. Disclaimer — the tool's existing disclaimer copy
 *
 * A tool renders only the sections its factual content needs; unrelated
 * content is never forced into a section to satisfy the template.
 */

/** One term/value line inside a receipt or result detail list. */
export function ReceiptRow({ term, value }: { term: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="type-helper text-ink-muted">{term}</dt>
      <dd className="tnum type-helper shrink-0 text-right text-ink">{value}</dd>
    </div>
  );
}

/** Named group inside a receipt. The heading is structural, never advisory. */
export function ReceiptSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section aria-label={title} className={className}>
      <h4 className="type-eyebrow mt-3 text-ink-faint">{title}</h4>
      <dl className="divide-y divide-line border-t border-line">{children}</dl>
    </section>
  );
}

export type ReceiptProps = {
  /** Summary line, e.g. `Calculation receipt · RG-001`. Preserved per tool. */
  summary: ReactNode;
  children: ReactNode;
  className?: string;
};

export function Receipt({ summary, children, className }: ReceiptProps) {
  return (
    <details
      className={cn("mt-4 rounded-lg border border-line bg-surface-muted/50 px-4 py-2", className)}
    >
      <summary className="type-label inline-flex min-h-11 cursor-pointer items-center text-ink">
        {summary}
      </summary>
      <div className="pb-2">{children}</div>
    </details>
  );
}

/** Muted disclaimer paragraph at the foot of a receipt. */
export function ReceiptDisclaimer({ children }: { children: ReactNode }) {
  return <p className="type-caption pb-1 pt-2 text-ink-muted">{children}</p>;
}
