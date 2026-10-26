import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * Surface primitive. `as` exists because pricing renders plan cards as
 * `<article>` (a self-contained offer) and the founding band as `<section>`
 * (a labelled region), while tool cards are plain boxes.
 */
export function Card({
  as: Tag = "div",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: "div" | "article" | "section" }) {
  return (
    <Tag className={cn("rounded-xl border border-line bg-surface p-5", className)} {...props} />
  );
}
