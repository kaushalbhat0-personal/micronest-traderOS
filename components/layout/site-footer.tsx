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
      <Container className="py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="max-w-md space-y-2">
            <p className="type-label">MicroNest Trader OS</p>
            <p className="type-helper text-ink-muted">
              Calculations and analysis tools only. Not investment advice. Verify inputs and
              applicable charges before trading.
            </p>
          </div>

          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-4 sm:justify-end">
              {FOOTER_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="type-helper inline-flex min-h-11 items-center text-ink-muted hover:text-ink"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <p className="type-caption mt-6 text-ink-muted">© {year} MicroNest Trader OS.</p>
      </Container>
    </footer>
  );
}
