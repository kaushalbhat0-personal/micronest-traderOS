import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Surface primitive. `as` exists because pricing renders plan cards as
 * `<article>` (a self-contained offer) and the founding band as `<section>`
 * (a labelled region), while tool cards are plain boxes.
 *
 * `elevation` prepares the V2 depth system: `flat` is today's single-plane
 * surface (default, unchanged); `raised` layers the raised surface with the
 * resting-card shadow. No call site needs to change.
 */
export function Card({
  as: Tag = "div",
  elevation = "flat",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: "div" | "article" | "section";
  elevation?: "flat" | "raised";
}) {
  return (
    <Tag
      className={cn(
        "rounded-xl border border-line bg-surface p-5",
        elevation === "raised" && "bg-surface-raised shadow-1",
        className,
      )}
      {...props}
    />
  );
}
