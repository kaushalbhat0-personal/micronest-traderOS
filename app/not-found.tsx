import Link from "next/link";

import { Container } from "@/components/layout/container";
import { buttonClasses } from "@/components/ui/button";

export default function NotFound() {
  return (
    <Container className="py-16 sm:py-24">
      <div className="max-w-xl space-y-4">
        <p className="type-eyebrow text-ink-muted">404</p>
        <h1 className="type-title">Page not found</h1>
        <p className="type-body text-ink-muted">
          The page you were looking for does not exist. The toolkit and pricing pages are still
          available.
        </p>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <Link href="/" className={buttonClasses("primary", "w-full sm:w-auto")}>
            Back to home
          </Link>
          <Link href="/tools" className={buttonClasses("secondary", "w-full sm:w-auto")}>
            View tools
          </Link>
        </div>
      </div>
    </Container>
  );
}
