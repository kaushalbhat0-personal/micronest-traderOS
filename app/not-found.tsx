import Link from "next/link";

import { Container } from "@/components/layout/container";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-xl space-y-4">
        <p className="text-xs font-semibold tracking-[0.08em] text-ink-muted uppercase">404</p>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Page not found</h1>
        <p className="text-base leading-relaxed text-ink-muted">
          The page you were looking for does not exist. The toolkit and pricing pages are still
          available.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link href="/" className={buttonClasses("primary")}>
            Back to home
          </Link>
          <Link href="/tools" className={buttonClasses("secondary")}>
            View tools
          </Link>
        </div>
      </div>
    </Container>
  );
}
