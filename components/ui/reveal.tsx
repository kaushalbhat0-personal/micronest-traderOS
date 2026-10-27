"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";

export type RevealTier = "micro" | "standard" | "emphasis";

/**
 * Small entrance-reveal island — the only JavaScript-driven animation in the
 * product. Observes its own visibility once via IntersectionObserver and sets
 * `data-visible`, letting the CSS `.reveal` tiers (opacity + small vertical
 * transform, motion tokens in `globals.css`) do the rest.
 *
 * Boundaries, by design:
 * - transform/opacity only; never layout properties;
 * - one-shot (disconnects after revealing, no scroll listeners);
 * - stagger delays are capped at 300ms so sequences stay calm;
 * - content is always in the DOM; without JS or IntersectionObserver the
 *   block renders visible, and `prefers-reduced-motion` forces the end state
 *   in CSS, so nothing essential hides behind animation.
 */
export type RevealProps = {
  tier?: RevealTier;
  /** Stagger delay in ms. Capped at 300ms; ignored under reduced motion. */
  delay?: number;
  /** Element to render. `li` keeps ordered/unordered lists semantic. */
  as?: "div" | "li" | "section" | "span";
  className?: string;
  children: React.ReactNode;
};

const MAX_DELAY_MS = 300;

export function Reveal({
  tier = "standard",
  delay = 0,
  as = "div",
  className,
  children,
}: RevealProps) {
  const observerRef = useRef<IntersectionObserver | null>(null);
  const [visible, setVisible] = useState(false);

  const setNode = useCallback((node: HTMLElement | null) => {
    if (node === null) return;
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observerRef.current = observer;
    observer.observe(node);
  }, []);

  useEffect(() => {
    return () => observerRef.current?.disconnect();
  }, []);

  const safeDelay = Math.max(0, Math.min(delay, MAX_DELAY_MS));
  const sharedProps = {
    "data-reveal": tier,
    ...(visible ? { "data-visible": "" } : {}),
    style: (safeDelay > 0 ? { transitionDelay: `${safeDelay}ms` } : undefined) as
      CSSProperties | undefined,
    className: cn("reveal", className),
  };
  const content = (
    <>
      <noscript>
        <style>{".reveal{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      {children}
    </>
  );

  switch (as) {
    case "li":
      return (
        <li ref={setNode} {...sharedProps}>
          {content}
        </li>
      );
    case "section":
      return (
        <section ref={setNode} {...sharedProps}>
          {content}
        </section>
      );
    case "span":
      return (
        <span ref={setNode} {...sharedProps}>
          {content}
        </span>
      );
    default:
      return (
        <div ref={setNode} {...sharedProps}>
          {content}
        </div>
      );
  }
}
