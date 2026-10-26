import Link from "next/link";
import { Container } from "@/components/layout/container";

const FOOTER_LINKS = [
  { href: "/tools", label: "Tools" },
  { href: "/pricing", label: "Pricing" },
  { href: "/disclaimer", label: "Disclaimer" },
] as const;

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-line">
      <Container className="space-y-4 py-8">
        <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">
          Calculations and analysis tools only. Not investment advice. Verify inputs and applicable
          charges before trading.
        </p>

        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-flex min-h-11 items-center rounded-md text-sm text-ink-muted hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-canvas focus-visible:outline-none"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <p className="text-xs text-ink-muted">© {year} MicroNest Trader OS.</p>
      </Container>
    </footer>
  );
}
