import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function fillCosts(
  page: Page,
  values: { buy: string; sell: string; quantity: string; brokerage: string },
) {
  await page.getByLabel("Buy price (₹)").fill(values.buy);
  await page.getByLabel("Sell price (₹)").fill(values.sell);
  await page.getByLabel("Quantity (shares)").fill(values.quantity);
  await page.getByLabel("Brokerage total (₹)").fill(values.brokerage);
}

test("TradeCost estimates costs and shows a receipt", async ({ page }) => {
  await page.goto("/tools/trade-cost");

  await fillCosts(page, { buy: "100", sell: "110", quantity: "100", brokerage: "40" });
  await page.getByRole("button", { name: "Estimate transaction costs" }).click();

  await expect(page.getByText("Survives costs")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Net P&L" })).toBeVisible();
  await expect(page.getByText("Breakeven sell price")).toBeVisible();
  const receipt = page.getByText("Calculation receipt · TC-001");
  await receipt.scrollIntoViewIfNeeded();
  await receipt.click();
  await expect(page.getByText("nse-cash-2026-03-01", { exact: true })).toBeVisible();
  await expect(page.getByText("2026-03-01", { exact: true }).first()).toBeVisible();
});

test("TradeCost reports short delivery as unsupported", async ({ page }) => {
  await page.goto("/tools/trade-cost");

  await page.getByLabel("Short").check();
  await fillCosts(page, { buy: "95", sell: "100", quantity: "100", brokerage: "40" });
  await page.getByRole("button", { name: "Estimate transaction costs" }).click();

  await expect(page.getByText("Not supported")).toBeVisible();
  await expect(page.getByText("short_delivery_unsupported")).toBeVisible();
});

test("RiskGuard hands a sizing to TradeCost with values prefilled", async ({ page }) => {
  await page.goto("/tools/risk-guard");

  await page.getByLabel("Capital (₹)").fill("100000");
  await page.getByLabel("Risk %").fill("2.5");
  await page.getByLabel("Entry (₹)").fill("100");
  await page.getByLabel("Stop-loss (₹)").fill("95");
  await page.getByLabel("Lot size").fill("1");
  await page.getByRole("button", { name: "Calculate position size" }).click();

  await expect(page.getByText("Within your risk budget")).toBeVisible();
  await page.getByRole("link", { name: "Check costs in TradeCost" }).click();

  await expect(page).toHaveURL(
    /\/tools\/trade-cost\?.*direction=long.*entry=100(&|$).*quantity=500/,
  );
  await expect(page.getByText("From your RiskGuard sizing", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Buy price (₹)")).toHaveValue("100");
  await expect(page.getByLabel("Quantity (shares)")).toHaveValue("500");

  await page.getByLabel("Sell price (₹)").fill("110");
  await page.getByLabel("Brokerage total (₹)").fill("40");
  await page.getByRole("button", { name: "Estimate transaction costs" }).click();

  await expect(page.getByText("Survives costs")).toBeVisible();
});

test("TradeCost has no automated accessibility violations", async ({ page }) => {
  await page.goto("/tools/trade-cost");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();

  expect(results.violations).toEqual([]);
});
