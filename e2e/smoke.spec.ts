import { expect, test } from "@playwright/test";

const PAGES = [
  { path: "/", heading: "Understand your trade before taking it." },
  { path: "/tools", heading: "Tools" },
  { path: "/pricing", heading: "Pricing" },
  { path: "/disclaimer", heading: "Disclaimer" },
] as const;

for (const { path, heading } of PAGES) {
  test(`${path} renders with one h1 and no console errors`, async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        errors.push(message.text());
      }
    });
    page.on("pageerror", (error) => {
      errors.push(error.message);
    });

    const response = await page.goto(path);

    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    expect(errors).toEqual([]);
  });
}

test("landing page lists all ten tools with honest statuses", async ({ page }) => {
  await page.goto("/");

  const toolNames = [
    "RiskGuard",
    "TradePlan",
    "TradeCost",
    "StrikeLens",
    "GreekMap",
    "OI Mapper",
    "StructureMap",
    "SetupScore",
    "LeakDetector",
    "ReviewOS",
  ];

  for (const name of toolNames) {
    await expect(page.getByRole("heading", { level: 3, name })).toBeVisible();
  }

  await expect(page.getByText("Coming soon")).toHaveCount(1);
  await expect(page.getByText("Live", { exact: true })).toHaveCount(0);
});

test("pricing page renders prices from configuration and no working checkout", async ({ page }) => {
  await page.goto("/pricing");

  await expect(page.getByText("₹199", { exact: true })).toBeVisible();
  await expect(page.getByText("₹1,999", { exact: true })).toBeVisible();
  await expect(page.getByText("₹599", { exact: true })).toBeVisible();
  await expect(page.getByText("₹4,999", { exact: true })).toBeVisible();
  await expect(page.getByText("₹399", { exact: true })).toBeVisible();
  await expect(page.getByText("₹3,999", { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "Not yet available" })).toHaveCount(2);
});

test("skip link moves focus to main content", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("baseline security headers are present", async ({ request }) => {
  const response = await request.get("/");

  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});

test("primary navigation meets the 44px touch-target minimum", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  const heights = await page
    .locator("header a")
    .evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().height));

  expect(heights.length).toBeGreaterThan(0);
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(43.5);
});

test("respects reduced-motion preferences", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const scrollBehavior = await page.evaluate(
    () => getComputedStyle(document.documentElement).scrollBehavior,
  );

  expect(scrollBehavior).toBe("auto");
});

test.describe("responsive layout", () => {
  for (const width of [360, 390, 768, 1280]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "desktop", "width matrix runs once");

      await page.setViewportSize({ width, height: 900 });

      for (const { path } of PAGES) {
        await page.goto(path);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );

        expect(overflow, `${path} overflows at ${width}px`).toBeLessThanOrEqual(1);
      }
    });
  }
});
