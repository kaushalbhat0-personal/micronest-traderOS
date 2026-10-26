import { expect, test } from "@playwright/test";

const PAGES = [
  { path: "/", heading: "Understand your trade before taking it." },
  { path: "/tools", heading: "Tools" },
  { path: "/tools/risk-guard", heading: "RiskGuard" },
  { path: "/tools/trade-plan", heading: "TradePlan" },
  { path: "/pricing", heading: "Pricing" },
  { path: "/disclaimer", heading: "Disclaimer" },
] as const;

const TOOL_NAMES = [
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
] as const;

const GROUP_NAMES = ["Plan & Risk", "Options", "Structure & Setup", "Behaviour & Review"] as const;

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

test("landing page introduces the problem, the toolkit and the philosophy", async ({ page }) => {
  await page.goto("/");

  for (const name of GROUP_NAMES) {
    await expect(page.getByRole("heading", { level: 3, name })).toBeVisible();
  }

  await expect(
    page.getByRole("heading", { level: 2, name: "Direction is the easy part" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Calculations and structure, not signals." }),
  ).toBeVisible();

  const statusLine = page.getByText(/10 tools/);
  await expect(statusLine).toContainText("8 planned");
  await expect(statusLine).toContainText("2 live");

  await expect(page.getByRole("link", { name: "Browse all tools" })).toHaveAttribute(
    "href",
    "/tools",
  );
});

test("tools index lists all ten tools with honest statuses", async ({ page }) => {
  await page.goto("/tools");

  for (const name of TOOL_NAMES) {
    await expect(page.getByRole("heading", { level: 3, name })).toBeVisible();
  }

  await expect(page.getByText("Coming soon")).toHaveCount(0);
  await expect(page.getByText("Planned")).toHaveCount(8);
  await expect(page.getByText("Live", { exact: true })).toHaveCount(2);
});

test("tool group links resolve to rendered sections", async ({ page }) => {
  await page.goto("/tools");

  const links = page.getByRole("navigation", { name: "Tool groups" }).getByRole("link");
  await expect(links).toHaveCount(GROUP_NAMES.length);

  const ids = await links.evaluateAll((elements) =>
    elements.map((element) => (element.getAttribute("href") ?? "").replace("#", "")),
  );

  for (const id of ids) {
    expect(id).not.toBe("");
    await expect(page.locator(`#${id}`)).toBeVisible();
  }
});

test("pricing renders every configured price and no working checkout", async ({ page }) => {
  await page.goto("/pricing");

  for (const price of ["₹199", "₹1,999", "₹599", "₹4,999", "₹399", "₹3,999"]) {
    await expect(page.getByText(price, { exact: true })).toBeVisible();
  }

  await expect(page.getByRole("button", { name: "Not yet available" })).toHaveCount(2);
  await expect(page.getByText("price cohort, not a separate plan")).toBeVisible();
});

test("skip link moves focus to main content", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

test("keyboard focus is visible", async ({ page }) => {
  await page.goto("/");

  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to content" });
  await expect(skipLink).toBeFocused();

  const outline = await skipLink.evaluate((element) => {
    const style = getComputedStyle(element);
    return { width: style.outlineWidth, style: style.outlineStyle };
  });

  expect(outline.style).toBe("solid");
  expect(Number.parseFloat(outline.width)).toBeGreaterThanOrEqual(2);
});

test("keyboard order follows the page order", async ({ page }) => {
  await page.goto("/");

  const expected = [
    page.getByRole("link", { name: "Skip to content" }),
    page.getByRole("link", { name: /MicroNest/ }),
    page.getByRole("link", { name: "Tools", exact: true }).first(),
    page.getByRole("link", { name: "Pricing", exact: true }).first(),
    page.getByRole("link", { name: "Disclaimer", exact: true }).first(),
    page.getByRole("link", { name: "Explore the toolkit" }),
  ];

  for (const locator of expected) {
    await page.keyboard.press("Tab");
    await expect(locator).toBeFocused();
  }
});

test("baseline security headers are present", async ({ request }) => {
  const response = await request.get("/");

  expect(response.headers()["x-content-type-options"]).toBe("nosniff");
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(response.headers()["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(response.headers()["x-powered-by"]).toBeUndefined();
});

test("every interactive target meets the 44px minimum at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });

  for (const { path } of PAGES) {
    await page.goto(path);

    const undersized = await page
      .locator("header a, main a, main button, footer a")
      .evaluateAll((elements) =>
        elements
          .filter((element) => element.getBoundingClientRect().height < 43.5)
          .map((element) => (element.textContent ?? "").trim().slice(0, 40)),
      );

    expect(undersized, `${path} has undersized targets`).toEqual([]);
  }
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
