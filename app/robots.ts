import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site";

/**
 * Crawlable-by-default robots. No private routes, API routes, or auth routes
 * exist in this build, so nothing is disallowed. The sitemap URL resolves
 * from the canonical origin (`NEXT_PUBLIC_APP_URL` in production).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
