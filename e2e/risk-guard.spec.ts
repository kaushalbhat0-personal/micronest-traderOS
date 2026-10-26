import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function fillTrade(
  page: Page,
  values: { capital: string; risk: string; entry: string; stop: string; lotSize: string },
) {
  await page.getByLabel("Capital (₹)").fill(values.capital);
  await page.getByLabel("Risk %").fill(values.risk);
  await page.getByLabel("Entry (₹)").fill(values.entry);
  await page.getByLabel("Stop-loss (₹)").fill(values.stop);
  await page.getByLabel("Lot size").fill(values.lotSize);
}

test("RiskGuard allows a trade that fits the budget and shows a receipt", async ({ page }) => {
  await page.goto("/tools/risk-guard");

  await fillTrade(page, {
    capital: "100000",
    risk: "2.5",
    entry: "100",
    stop: "95",
    lotSize: "1",
  });
  await page.getByRole("button", { name: "Calculate position size" }).click();

  await expect(page.getByText("Within your risk budget")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Allowed quantity" })).toBeVisible();
  await expect(page.locator("p.type-metric")).toContainText("500");

  const receipt = page.getByText("Calculation receipt · RG-001").first();
  await receipt.scrollIntoViewIfNeeded();
  await receipt.click();
  await expect(page.getByText("Floor to lot size").first()).toBeVisible();
});

test("RiskGuard blocks a trade that cannot afford one lot", async ({ page }) => {
  await page.goto("/tools/risk-guard");

  await fillTrade(page, {
    capital: "500",
    risk: "1",
    entry: "100",
    stop: "95",
    lotSize: "75",
  });
  await page.getByRole("button", { name: "Calculate position size" }).click();

  await expect(page.getByText("Trade blocked", { exact: true })).toBeVisible();
  await expect(
    page.locator("section[aria-labelledby='risk-guard-result-heading'] p.type-body"),
  ).toContainText("The risk budget cannot accommodate one full lot");
});

test("RiskGuard has no automated accessibility violations", async ({ page }) => {
  await page.goto("/tools/risk-guard");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
