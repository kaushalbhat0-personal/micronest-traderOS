import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function fillPlan(page: Page) {
  await page.getByLabel("Setup name").fill("Breakout retest");
  await page.getByLabel("Thesis").fill("Price reclaimed the level and held on a retest.");
  await page.getByLabel("Invalidation").fill("A close back below the level.");
  await page.getByLabel("Entry (₹)").fill("100");
  await page.getByLabel("Stop-loss (₹)").fill("95");
  await page.getByLabel("Target (₹)").fill("110");
  await page.getByRole("button", { name: "Check my plan" }).click();
}

test("TradePlan hands a coherent plan to RiskGuard with values prefilled", async ({ page }) => {
  await page.goto("/tools/trade-plan");
  await fillPlan(page);

  await expect(page.getByText("Coherent plan", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Size this trade in RiskGuard" }).click();

  await expect(page).toHaveURL(/\/tools\/risk-guard\?.*direction=long.*entry=100.*stop=95/);
  expect(page.url()).toContain("target=110");
  expect(page.url()).not.toContain("Breakout");

  await expect(page.getByText("From your TradePlan")).toBeVisible();
  await expect(page.getByLabel("Entry (₹)")).toHaveValue("100");
  await expect(page.getByLabel("Stop-loss (₹)")).toHaveValue("95");
  await expect(page.getByLabel("Target (₹)")).toHaveValue("110");
});

test("prefilled handoff values stay editable and RiskGuard recalculates", async ({ page }) => {
  await page.goto("/tools/trade-plan");
  await fillPlan(page);
  await page.getByRole("link", { name: "Size this trade in RiskGuard" }).click();

  await expect(page.getByText("From your TradePlan")).toBeVisible();
  await page.getByLabel("Capital (₹)").fill("100000");
  await page.getByLabel("Risk %").fill("2.5");
  await page.getByLabel("Lot size").fill("1");
  await page.getByLabel("Entry (₹)").fill("200");
  await page.getByLabel("Target (₹)").fill("");
  await page.getByRole("button", { name: "Calculate position size" }).click();

  // Entry 200 against stop 95: per-unit risk 105, budget 2500 → 23 units.
  await expect(page.getByText("Within your risk budget")).toBeVisible();
  await expect(page.locator("p.type-metric")).toContainText("23");
});

test("an incoherent plan exposes no sizing handoff", async ({ page }) => {
  await page.goto("/tools/trade-plan");
  await page.getByLabel("Setup name").fill("Breakout retest");
  await page.getByLabel("Thesis").fill("Price reclaimed the level and held on a retest.");
  await page.getByLabel("Invalidation").fill("A close back below the level.");
  await page.getByLabel("Entry (₹)").fill("100");
  await page.getByLabel("Stop-loss (₹)").fill("105");
  await page.getByRole("button", { name: "Check my plan" }).click();

  await expect(page.getByText("Plan incoherent", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Size this trade in RiskGuard" }),
  ).toHaveCount(0);
});

test("RiskGuard works with direct navigation and rejects tampered handoff values", async ({
  page,
}) => {
  await page.goto("/tools/risk-guard");

  await expect(page.getByText("From your TradePlan")).toHaveCount(0);
  await expect(page.getByLabel("Entry (₹)")).toHaveValue("");

  await page.goto("/tools/risk-guard?direction=sideways&entry=abc&stop=95&thesis=breakout");
  // Only the valid stop survives; the cue reflects a partial handoff.
  await expect(page.getByText("From your TradePlan")).toBeVisible();
  await expect(page.getByLabel("Entry (₹)")).toHaveValue("");
  await expect(page.getByLabel("Stop-loss (₹)")).toHaveValue("95");

  // Tampered values cannot bypass validation: submitting without a valid
  // entry still fails at the RiskGuard boundary.
  await page.getByLabel("Capital (₹)").fill("100000");
  await page.getByLabel("Risk %").fill("2.5");
  await page.getByLabel("Lot size").fill("1");
  await page.getByRole("button", { name: "Calculate position size" }).click();
  await expect(page.getByText("Entry is required.")).toBeVisible();
});

test("connected flow has no automated accessibility violations", async ({ page }) => {
  await page.goto("/tools/trade-plan");
  await fillPlan(page);

  let results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);

  await page.getByRole("link", { name: "Size this trade in RiskGuard" }).click();
  results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
