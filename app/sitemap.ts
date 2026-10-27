import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * Public indexable routes only. Query-string handoff URLs, API routes, and
 * future auth/account routes are intentionally excluded.
 */
const PUBLIC_PATHS = [
  "/",
  "/tools",
  "/tools/risk-guard",
  "/tools/trade-plan",
  "/tools/trade-cost",
  "/tools/strike-lens",
  "/tools/greek-map",
  "/pricing",
  "/disclaimer",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();

  return PUBLIC_PATHS.map((path) => ({
    url: `${base}${path === "/" ? "" : path}`,
    changeFrequency: "monthly" as const,
    priority: path === "/" ? 1 : 0.7,
  }));
}
