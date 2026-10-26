"use client";

import { useEffect } from "react";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Button, buttonClasses } from "@/components/ui/button";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">
          Something went wrong
        </p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          This page could not load
        </h1>
        <p className="text-base leading-relaxed text-ink-muted">
          Try again. If the problem continues, return to the home page and use another tool.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Button onClick={reset}>Try again</Button>
          <Link href="/" className={buttonClasses("secondary")}>
            Back to home
          </Link>
        </div>
      </div>
    </Container>
  );
}
