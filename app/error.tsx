"use client";

import Link from "next/link";
import { useEffect } from "react";

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
        <p className="type-eyebrow text-ink-muted">Something went wrong</p>
        <h1 className="type-title">This page could not load</h1>
        <p className="type-body text-ink-muted">
          Try again. If the problem continues, return to the home page and use another tool.
        </p>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Button onClick={reset} className="w-full sm:w-auto">
            Try again
          </Button>
          <Link href="/" className={buttonClasses("secondary", "w-full sm:w-auto")}>
            Back to home
          </Link>
        </div>
      </div>
    </Container>
  );
}
