import { describe, expect, it } from "vitest";

import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { DEV_FALLBACK_SITE_URL, siteUrl } from "@/lib/site";

const EXPECTED_PATHS = [
  "/",
  "/tools",
  "/tools/risk-guard",
  "/tools/trade-plan",
  "/tools/trade-cost",
  "/tools/strike-lens",
  "/tools/greek-map",
  "/pricing",
  "/disclaimer",
];

describe("pre-deploy SEO surface", () => {
  it("falls back to a safe local origin when no public app URL is set", () => {
    expect(process.env.NEXT_PUBLIC_APP_URL).toBeUndefined();
    expect(siteUrl()).toBe(DEV_FALLBACK_SITE_URL);
  });

  it("serves a crawlable robots file pointing at the sitemap", () => {
    const result = robots();

    expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBe(`${siteUrl()}/sitemap.xml`);
  });

  it("lists only actual public routes with absolute URLs", () => {
    const entries = sitemap();
    const base = siteUrl();

    expect(entries).toHaveLength(EXPECTED_PATHS.length);
    expect(entries.map((entry) => entry.url)).toEqual(
      EXPECTED_PATHS.map((path) => `${base}${path === "/" ? "" : path}`),
    );

    for (const entry of entries) {
      expect(entry.url.startsWith("http")).toBe(true);
      expect(entry.url).not.toContain("?");
      expect(entry.url).not.toContain("/api/");
      expect(entry.url).not.toContain("/auth");
    }
  });
});
