import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function fillRow(page: Page, index: number, strike: string, premium: string) {
  await page.getByLabel("Strike (₹)").nth(index).fill(strike);
  await page.getByLabel("Premium (₹)").nth(index).fill(premium);
}

async function compare(page: Page) {
  await page.getByRole("button", { name: "Compare strikes" }).click();
}

test("StrikeLens compares CE strikes and shows a receipt", async ({ page }) => {
  await page.goto("/tools/strike-lens");

  await page.getByLabel("Spot (₹)").fill("100");
  await fillRow(page, 0, "95", "8");
  await page.getByRole("button", { name: "Add strike" }).click();
  await fillRow(page, 1, "105", "3");
  await compare(page);

  await expect(page.getByText("Compared 2 strikes", { exact: true })).toBeVisible();
  await expect(page.getByText("ITM").first()).toBeVisible();
  await expect(page.getByText("Nearest to spot")).toBeVisible();
  await expect(page.getByText("Option breakeven before transaction costs").first()).toBeVisible();
  const receipt = page.getByText("Calculation receipt · SL-001");
  await receipt.scrollIntoViewIfNeeded();
  await receipt.click();
  await expect(page.getByText("SL-001", { exact: true })).toBeVisible();
});

test("StrikeLens compares PE strikes with put arithmetic", async ({ page }) => {
  await page.goto("/tools/strike-lens");

  await page.getByLabel("PE (Put)").check();
  await page.getByLabel("Spot (₹)").fill("100");
  await fillRow(page, 0, "105", "8");
  await compare(page);

  await expect(page.getByText("Compared 1 strike", { exact: true })).toBeVisible();
  await expect(page.getByText("₹97.00")).toBeVisible();
});

test("StrikeLens rejects invalid input without comparing", async ({ page }) => {
  await page.goto("/tools/strike-lens");

  await compare(page);

  await expect(page.getByText("Spot is required.")).toBeVisible();
  await expect(page.getByText("Strike is required.")).toBeVisible();
  await expect(page.getByText(/Compared/)).toHaveCount(0);
});

test("StrikeLens rejects duplicate strikes", async ({ page }) => {
  await page.goto("/tools/strike-lens");

  await page.getByLabel("Spot (₹)").fill("100");
  await fillRow(page, 0, "95", "8");
  await page.getByRole("button", { name: "Add strike" }).click();
  await fillRow(page, 1, "95", "3");
  await compare(page);

  await expect(page.getByText(/Each strike must be unique\./)).toBeVisible();
  await expect(page.getByText(/Compared/)).toHaveCount(0);
});

test("StrikeLens flags a premium below intrinsic without blocking the rest", async ({ page }) => {
  await page.goto("/tools/strike-lens");

  await page.getByLabel("Spot (₹)").fill("100");
  await fillRow(page, 0, "95", "2");
  await compare(page);

  await expect(page.getByText("Check premium")).toBeVisible();
  await expect(page.getByText("extrinsic value cannot be negative")).toBeVisible();
});

test("StrikeLens prefills spot from a handoff and stays editable", async ({ page }) => {
  await page.goto("/tools/strike-lens?spot=100");

  await expect(page.getByText("Spot carried forward")).toBeVisible();
  await expect(page.getByLabel("Spot (₹)")).toHaveValue("100");

  // An edited prefill is what gets compared.
  await page.getByLabel("Spot (₹)").fill("200");
  await fillRow(page, 0, "190", "16");
  await compare(page);

  await expect(page.getByText("Compared 1 strike", { exact: true })).toBeVisible();
  await expect(page.getByText("₹190.00 CE")).toBeVisible();
  await page.getByText("Calculation receipt · SL-001").click();
  await expect(page.getByText("₹200.00").first()).toBeVisible();
});

test("StrikeLens ignores unexpected query parameters", async ({ page }) => {
  await page.goto("/tools/strike-lens?spot=100&direction=long&strike=95&premium=8&foo=bar");

  await expect(page.getByLabel("Spot (₹)")).toHaveValue("100");
  await fillRow(page, 0, "95", "8");
  await compare(page);

  await expect(page.getByText("Compared 1 strike", { exact: true })).toBeVisible();
});

test("StrikeLens has no automated accessibility violations", async ({ page }) => {
  await page.goto("/tools/strike-lens");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});

for (const viewport of [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
] as const) {
  test(`StrikeLens has no overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/tools/strike-lens");

    await page.getByLabel("Spot (₹)").fill("100");
    await fillRow(page, 0, "95", "8");
    await page.getByRole("button", { name: "Add strike" }).click();
    await fillRow(page, 1, "105", "3");
    await compare(page);

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(overflow).toBe(false);
  });
}

test("StrikeLens respects reduced motion and keeps touch targets usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tools/strike-lens");

  await page.getByLabel("Spot (₹)").fill("100");
  await fillRow(page, 0, "95", "8");
  await compare(page);

  await expect(page.getByText("Compared 1 strike", { exact: true })).toBeVisible();
  const submitBox = await page.getByRole("button", { name: "Compare strikes" }).boundingBox();
  expect(submitBox?.height).toBeGreaterThanOrEqual(44);
});
