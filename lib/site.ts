import { env } from "@/lib/env";

/**
 * Canonical site origin.
 *
 * Production resolves from `NEXT_PUBLIC_APP_URL`. Local development and CI
 * fall back to a safe loopback origin so `robots.txt`, `sitemap.xml` and
 * canonical metadata always generate without inventing a custom domain.
 */
export const DEV_FALLBACK_SITE_URL = "http://localhost:3000";

export function siteUrl(): string {
  return env.appUrl ?? DEV_FALLBACK_SITE_URL;
}
