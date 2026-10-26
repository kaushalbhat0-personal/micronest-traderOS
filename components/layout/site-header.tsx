import Link from "next/link";
import { Container } from "@/components/layout/container";

const NAV_ITEMS = [
  { href: "/tools", label: "Tools" },
  { href: "/pricing", label: "Pricing" },
  { href: "/disclaimer", label: "Disclaimer" },
] as const;

const NAV_LINK_CLASS =
  "type-label inline-flex min-h-11 items-center rounded-md px-2.5 text-ink-muted transition-colors hover:bg-surface-muted hover:text-ink";

/**
 * Two rows on mobile (brand, then nav), one row from `sm` up. The header is
 * deliberately not sticky: it would take ~100px of a 360px-wide viewport on
 * every scroll.
 */
export function SiteHeader() {
  return (
    <header className="border-b border-line bg-canvas">
      <Container className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 self-start rounded-md">
          <span className="type-subtitle">MicroNest</span>
          <span className="type-helper text-ink-muted">Trader OS</span>
        </Link>

        <nav aria-label="Primary">
          <ul className="-mx-2 flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className={NAV_LINK_CLASS}>
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
