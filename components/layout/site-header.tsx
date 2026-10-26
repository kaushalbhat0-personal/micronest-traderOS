import Link from "next/link";
import { Container } from "@/components/layout/container";

const NAV_ITEMS = [
  { href: "/tools", label: "Tools" },
  { href: "/pricing", label: "Pricing" },
  { href: "/disclaimer", label: "Disclaimer" },
] as const;

const LINK_CLASS =
  "inline-flex min-h-11 items-center rounded-md px-2.5 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none";

export function SiteHeader() {
  return (
    <header className="border-b border-line bg-canvas">
      <Container className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Link
          href="/"
          className="inline-flex min-h-11 items-center gap-2 self-start rounded-md focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none"
        >
          <span className="text-base font-semibold tracking-tight">MicroNest</span>
          <span className="text-sm text-ink-muted">Trader OS</span>
        </Link>

        <nav aria-label="Primary">
          <ul className="-mx-2 flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={LINK_CLASS}>
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </Container>
    </header>
  );
}
