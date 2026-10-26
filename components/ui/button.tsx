import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-hover",
  secondary:
    "border border-line bg-surface text-ink hover:bg-surface-muted active:bg-surface-muted",
  ghost: "text-primary hover:bg-surface-muted active:bg-surface-muted",
};

/**
 * Button styling, also used by `<Link>` for navigational actions so links stay
 * links and buttons stay buttons.
 *
 * Focus uses the global `:focus-visible` outline. Disabled buttons switch to a
 * neutral surface instead of fading, because 60% opacity on the primary colour
 * drops label contrast below AA.
 */
export function buttonClasses(variant: ButtonVariant = "primary", className?: string): string {
  return cn(
    "type-label inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 py-2",
    "transition-colors duration-150",
    "disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-muted",
    VARIANTS[variant],
    className,
  );
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export function Button({ variant = "primary", className, type = "button", ...props }: ButtonProps) {
  return <button type={type} className={buttonClasses(variant, className)} {...props} />;
}
