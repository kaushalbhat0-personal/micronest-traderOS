import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function fillPlan(
  page: Page,
  values: {
    setup: string;
    thesis: string;
    invalidation: string;
    entry: string;
    stop: string;
    target: string;
  },
) {
  await page.getByLabel("Setup name").fill(values.setup);
  await page.getByLabel("Thesis").fill(values.thesis);
  await page.getByLabel("Invalidation").fill(values.invalidation);
  await page.getByLabel("Entry (₹)").fill(values.entry);
  await page.getByLabel("Stop-loss (₹)").fill(values.stop);
  await page.getByLabel("Target (₹)").fill(values.target);
}

const VALID = {
  setup: "Breakout retest",
  thesis: "Price reclaimed the level and held on a retest.",
  invalidation: "A close back below the level.",
  entry: "100",
  stop: "95",
  target: "110",
};

test("TradePlan accepts a coherent plan and shows a receipt", async ({ page }) => {
  await page.goto("/tools/trade-plan");

  await fillPlan(page, VALID);
  await page.getByRole("button", { name: "Check my plan" }).click();

  await expect(page.getByText("Coherent plan", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "03 · Risk / reward" })).toBeVisible();
  await expect(page.locator("p.type-metric")).toContainText("2.00");

  const receipt = page.getByText("05 · Plan receipt · TP-001");
  await receipt.scrollIntoViewIfNeeded();
  await receipt.click();
  await expect(page.getByText("No rounding").first()).toBeVisible();
});

test("TradePlan flags an incoherent plan without correcting it", async ({ page }) => {
  await page.goto("/tools/trade-plan");

  await fillPlan(page, { ...VALID, stop: "105" });
  await page.getByRole("button", { name: "Check my plan" }).click();

  await expect(page.getByText("Plan incoherent", { exact: true })).toBeVisible();
  await expect(
    page.locator("section[aria-labelledby='trade-plan-result-heading'] p.type-body"),
  ).toContainText("Stop-loss is not below the entry price");
});

test("TradePlan has no automated accessibility violations", async ({ page }) => {
  await page.goto("/tools/trade-plan");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
