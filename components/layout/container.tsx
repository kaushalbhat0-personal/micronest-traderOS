import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Single content width for the whole product. Wider screens get whitespace. */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>
  );
}
