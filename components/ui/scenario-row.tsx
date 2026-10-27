import type { ReactNode } from "react";

import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Standard scenario container for tools that already render scenario
 * outputs (StrikeLens strike rows, GreekMap spot/time rows).
 *
 * Presentation only: `label`, `markers` and `note` are display strings the
 * calling tool derives from its existing result objects. This component
 * never calculates scenario values and never adds scenarios to a tool.
 *
 * Pattern:
 * - scenario label (heading)
 * - result/value (children, e.g. a definition list)
 * - base/current marker where applicable (badges)
 * - omission note where applicable
 */
export type ScenarioMarker = {
  text: ReactNode;
  tone?: BadgeTone;
};

export type ScenarioRowProps = {
  /** Visible scenario label, e.g. `Spot +5% · ₹105.00`. */
  label: ReactNode;
  /** Accessible name for the article. Defaults to the label text when it is a string. */
  ariaLabel?: string;
  /** Heading level for the label. Strike rows sit at h3; nested what-if rows at h4. */
  headingLevel?: "h3" | "h4";
  /** Badges such as moneyness, `Nearest to spot`, or `Your inputs`. */
  markers?: ScenarioMarker[];
  /** Result/value content, e.g. a definition list of already-computed figures. */
  children?: ReactNode;
  /** Omission or footnote line, e.g. `omitted — V1 has a 1-day DTE floor`. */
  note?: ReactNode;
  className?: string;
};

export function ScenarioRow({
  label,
  ariaLabel,
  headingLevel = "h3",
  markers = [],
  children,
  note,
  className,
}: ScenarioRowProps) {
  const Heading = headingLevel;
  return (
    <article
      aria-label={ariaLabel ?? (typeof label === "string" ? label : undefined)}
      className={cn("rounded-lg border border-line bg-surface-muted/40 p-4", className)}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Heading className="type-subtitle tnum text-ink">{label}</Heading>
        {markers.map((marker, index) => (
          <Badge key={index} tone={marker.tone ?? "neutral"}>
            {marker.text}
          </Badge>
        ))}
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
      {note ? <p className="type-caption mt-2 text-ink-muted">{note}</p> : null}
    </article>
  );
}
