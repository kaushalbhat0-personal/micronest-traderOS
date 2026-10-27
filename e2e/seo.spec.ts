import { expect, test } from "@playwright/test";

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
];

test("robots.txt allows crawling and references the sitemap", async ({ request }) => {
  const response = await request.get("/robots.txt");

  expect(response.status()).toBe(200);

  const body = await response.text();
  expect(body).toContain("User-Agent: *");
  expect(body).toContain("Allow: /");
  expect(body).toContain("/sitemap.xml");
});

test("sitemap.xml lists every public route", async ({ request }) => {
  const response = await request.get("/sitemap.xml");

  expect(response.status()).toBe(200);

  const body = await response.text();
  for (const path of PUBLIC_PATHS) {
    expect(body, `sitemap misses ${path}`).toContain(path === "/" ? "<loc>" : path);
  }
  expect(body).not.toContain("/api/");
});

test("homepage emits a canonical link", async ({ page }) => {
  await page.goto("/");

  const canonical = page.locator('link[rel="canonical"]');
  await expect(canonical).toHaveCount(1);
  await expect(canonical).toHaveAttribute("href", /https?:\/\/.+/);
});

test("public routes remain accessible", async ({ request }) => {
  for (const path of PUBLIC_PATHS) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
  }
});
