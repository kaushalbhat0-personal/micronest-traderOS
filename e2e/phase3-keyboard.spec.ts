import { expect, test, type Page } from "@playwright/test";

async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "";
    const labelledBy = el.getAttribute("aria-labelledby");
    const labelledText =
      labelledBy
        ?.split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ") ?? "";
    const forLabel =
      el.id !== "" ? (document.querySelector(`label[for="${el.id}"]`)?.textContent ?? "") : "";
    return `${el.getAttribute("aria-label") ?? ""} ${labelledText} ${forLabel} ${el.textContent ?? ""}`;
  });
}

async function tabTo(page: Page, name: string) {
  for (let i = 0; i < 80; i += 1) {
    await page.keyboard.press("Tab");
    if ((await focusedName(page)).includes(name)) return;
  }
  throw new Error(`never focused ${name}`);
}

test("keyboard: RiskGuard focus, inputs, calculate, result, receipt", async ({ page }) => {
  await page.goto("/tools/risk-guard");
  await page.locator(".skip-link").focus();
  await page.keyboard.press("Enter");
  await tabTo(page, "Capital");
  await page.keyboard.type("100000");
  await tabTo(page, "Risk %");
  await page.keyboard.type("1");
  await tabTo(page, "Entry");
  await page.keyboard.type("100");
  await tabTo(page, "Stop-loss");
  await page.keyboard.type("95");
  await tabTo(page, "Lot size");
  await page.keyboard.type("1");
  await tabTo(page, "Calculate position size");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Within your risk budget")).toBeVisible();
  await tabTo(page, "Calculation receipt");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Maximum before lot flooring")).toBeVisible();
});

test("keyboard: TradePlan focus, inputs, calculate, decision, receipt", async ({ page }) => {
  await page.goto("/tools/trade-plan");
  await tabTo(page, "Setup name");
  await page.keyboard.type("Breakout retest");
  await tabTo(page, "Thesis");
  await page.keyboard.type("Holds on retest.");
  await tabTo(page, "Invalidation");
  await page.keyboard.type("Closes back below.");
  await tabTo(page, "Entry");
  await page.keyboard.type("100");
  await tabTo(page, "Stop-loss");
  await page.keyboard.type("95");
  await tabTo(page, "Check my plan");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Coherent plan", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "03 · Risk / reward" })).toBeVisible();
  await expect(page.getByText("05 · Plan receipt · TP-001")).toBeVisible();
});

test("keyboard: TradeCost focus, inputs, calculate, net result, receipt", async ({ page }) => {
  await page.goto("/tools/trade-cost");
  await tabTo(page, "Buy price");
  await page.keyboard.type("100");
  await tabTo(page, "Sell price");
  await page.keyboard.type("110");
  await tabTo(page, "Quantity");
  await page.keyboard.type("100");
  await tabTo(page, "Brokerage total");
  await page.keyboard.type("40");
  await tabTo(page, "Estimate transaction costs");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Survives costs")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Net P&L" })).toBeVisible();
  await expect(page.getByText("Calculation receipt · TC-001")).toBeVisible();
});

test("keyboard: StrikeLens focus, spot, rows, compare, result, receipt", async ({ page }) => {
  await page.goto("/tools/strike-lens");
  await tabTo(page, "Spot");
  await page.keyboard.type("100");
  await tabTo(page, "Strike");
  await page.keyboard.type("95");
  await tabTo(page, "Premium");
  await page.keyboard.type("8");
  await tabTo(page, "Compare strikes");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Compared 1 strike", { exact: true })).toBeVisible();
  await expect(page.getByText("Calculation receipt · SL-001")).toBeVisible();
});

test("keyboard: GreekMap focus, inputs, calculate, hero, scenarios, receipt", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await tabTo(page, "Spot");
  await page.keyboard.type("100");
  await tabTo(page, "Strike");
  await page.keyboard.type("100");
  await tabTo(page, "Days to expiry");
  await page.keyboard.type("30");
  await tabTo(page, "Volatility");
  await page.keyboard.type("20");
  await tabTo(page, "Risk-free rate");
  await page.keyboard.type("6");
  await tabTo(page, "Dividend yield");
  await page.keyboard.type("0");
  await tabTo(page, "Calculate model");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Model value", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("₹2.54").first()).toBeVisible();
  await expect(page.getByText("What-if (not a forecast)").first()).toBeVisible();
  await expect(page.getByText("Calculation receipt · GM-001")).toBeVisible();
});
