import type { InputHTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Shared form language for the five live tools: field grouping rhythm,
 * unit adornments, parsed-value micro-confirmation, and error-entry
 * treatment.
 *
 * Presentation only. Labels, hints, error strings, validation timing and
 * submitted values all stay owned by the calling tool — these components
 * only render what they are given.
 *
 * Accessibility contract:
 * - the `<label>` stays authoritative; adornments are `aria-hidden` and
 *   never enter the accessible name;
 * - errors keep the `{id}-error` / `{id}-hint` ids so the tool's existing
 *   `aria-describedby` wiring is unchanged;
 * - the parsed confirmation is deliberately NOT added to
 *   `aria-describedby`, so focus announcements stay short; screen-reader
 *   users can still encounter it while browsing.
 */

/** Label + input + hint/error/confirmation block with the product rhythm. */
export function Field({
  id,
  label,
  hint,
  error,
  confirmation,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** Muted parsed-value line, shown only when the tool has a valid parse. */
  confirmation?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="type-label block text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="type-caption mt-1 font-medium text-danger">
          {error}
        </p>
      ) : (
        <>
          {hint ? (
            <p id={`${id}-hint`} className="type-caption mt-1 text-ink-muted">
              {hint}
            </p>
          ) : null}
          {confirmation ? <ParsedValue>{confirmation}</ParsedValue> : null}
        </>
      )}
    </div>
  );
}

export type TextInputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Non-editable unit shown inside the input's leading edge, e.g. `₹`. */
  prefix?: string;
  /** Non-editable unit shown inside the input's trailing edge, e.g. `%`. */
  suffix?: string;
  /** Invalid-entry treatment: danger border with a matching focus ring. */
  invalid?: boolean;
};

/**
 * Text input with optional decorative unit adornments. The adornment is a
 * visual echo of the unit the field already represents (kept in the label);
 * it is `aria-hidden` and pointer-transparent so it never interferes with
 * editing, focus, or accessible naming.
 */
export function TextInput({ prefix, suffix, invalid, className, ...props }: TextInputProps) {
  return (
    <span className="relative mt-1.5 block">
      {prefix ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted"
        >
          {prefix}
        </span>
      ) : null}
      <input
        {...props}
        aria-invalid={props["aria-invalid"] ?? invalid}
        className={cn(
          "tnum min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-ink placeholder:text-ink-muted/70",
          prefix ? "pl-7" : null,
          suffix ? "pr-14" : null,
          invalid ? "border-danger focus-visible:outline-danger" : null,
          className,
        )}
      />
      {suffix ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-3 top-1/2 max-w-10 -translate-y-1/2 truncate text-sm text-ink-muted"
        >
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

/**
 * Subtle presentation-level confirmation of an already-parsed value, e.g.
 * `Parsed as ₹1,25,000.00`. The calling tool derives the text from its
 * existing parser/state; this component only styles it. Rendered only when
 * the field is non-empty and valid — never on empty or invalid input.
 */
export function ParsedValue({ children }: { children: ReactNode }) {
  return <p className="type-caption mt-1 text-ink-muted">{children}</p>;
}
