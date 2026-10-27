import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function fillValidCall(page: Page) {
  await page.getByLabel("Spot (₹)").fill("100");
  await page.getByLabel("Strike (₹)").fill("100");
  await page.getByLabel("Days to expiry").fill("30");
  await page.getByLabel("Volatility (% per year)").fill("20");
  await page.getByLabel("Risk-free rate (% per year)").fill("6");
  await page.getByLabel("Dividend yield (% per year)").fill("0");
}

async function calculate(page: Page) {
  await page.getByRole("button", { name: "Calculate model" }).click();
}

test("GreekMap route loads with a single h1", async ({ page }) => {
  const response = await page.goto("/tools/greek-map");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "GreekMap" })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
});

test("GreekMap calculates a valid call and shows the model result", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await fillValidCall(page);
  await calculate(page);

  await expect(page.getByText("Model value").first()).toBeVisible();
  await expect(page.getByText("₹2.54").first()).toBeVisible();
  await expect(page.getByText("0.5456").first()).toBeVisible();
});

test("GreekMap calculates a valid put with a negative delta", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await page.getByLabel("PE (Put)").check();
  await fillValidCall(page);
  await calculate(page);

  await expect(page.getByText("₹2.04").first()).toBeVisible();
  await expect(page.getByText("-0.4544").first()).toBeVisible();
});

test("GreekMap shows all five Greeks with units", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await fillValidCall(page);
  await calculate(page);

  for (const greek of ["Delta", "Gamma", "Theta", "Vega", "Rho"]) {
    await expect(page.getByText(greek, { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("0.069121").first()).toBeVisible();
  await expect(page.getByText("per ₹1", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("₹ / calendar day").first()).toBeVisible();
  await expect(page.getByText("₹ / 1pp IV").first()).toBeVisible();
  await expect(page.getByText("₹ / 1pp rate").first()).toBeVisible();
});

test("GreekMap shows five spot scenarios with the base row badged", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await fillValidCall(page);
  await calculate(page);

  await expect(page.getByText("What-if (not a forecast)").first()).toBeVisible();
  for (const pct of ["-10%", "-5%", "0%", "5%", "10%"]) {
    await expect(page.getByLabel(`Spot ${pct} scenario`, { exact: false })).toBeVisible();
  }
  await expect(page.getByText("Your inputs").first()).toBeVisible();
});

test("GreekMap shows three time scenarios", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await fillValidCall(page);
  await calculate(page);

  await expect(page.getByText("What-if (not a forecast)").nth(1)).toBeVisible();
  for (const days of [1, 3, 7]) {
    await expect(page.getByLabel(`Minus ${days} day scenario`)).toBeVisible();
  }
});

test("GreekMap omits time rows under the 1-day floor", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await fillValidCall(page);
  await page.getByLabel("Days to expiry").fill("1");
  await calculate(page);

  await expect(page.getByText("omitted — V1 has a 1-day DTE floor").first()).toBeVisible();
});

test("GreekMap shows a subordinate arithmetic comparison for a typed premium", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await fillValidCall(page);
  await page.getByLabel("Your premium (₹, optional)").fill("3");
  await calculate(page);

  await expect(page.getByText("Model comparison")).toBeVisible();
  await expect(
    page.getByText("Arithmetic difference only — not a mispricing signal."),
  ).toBeVisible();
  await expect(page.getByText("+₹0.46")).toBeVisible();
});

test("GreekMap blocks invalid input instead of calculating", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await calculate(page);

  await expect(page.getByText("Spot is required.")).toBeVisible();
  await expect(page.getByText("Volatility is required.")).toBeVisible();
  await expect(page.getByText("Model calculated")).toHaveCount(0);
  await expect(page.getByText("What-if (not a forecast)")).toHaveCount(0);
});

test("GreekMap warns but still calculates on a premium under intrinsic value", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await fillValidCall(page);
  await page.getByLabel("Spot (₹)").fill("110");
  await page.getByLabel("Your premium (₹, optional)").fill("5");
  await calculate(page);

  await expect(page.getByText(/under the intrinsic value/)).toBeVisible();
  await expect(page.getByText("Model comparison")).toBeVisible();
});

test("GreekMap expands the GM-001 receipt", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await fillValidCall(page);
  await calculate(page);

  const receipt = page.getByText("Calculation receipt · GM-001");
  await receipt.scrollIntoViewIfNeeded();
  await receipt.click();
  await expect(page.getByText("GM-001", { exact: true })).toBeVisible();
  await expect(page.getByText(/not an NSE settlement/)).toBeVisible();
});

test("GreekMap prefills type, strike and spot from a StrikeLens handoff", async ({ page }) => {
  await page.goto("/tools/greek-map?type=put&strike=105&spot=100");

  await expect(page.getByText("Values carried forward")).toBeVisible();
  await expect(page.getByLabel("PE (Put)")).toBeChecked();
  await expect(page.getByLabel("Spot (₹)")).toHaveValue("100");
  await expect(page.getByLabel("Strike (₹)")).toHaveValue("105");

  // Every field stays editable: the handoff never locks the form.
  await page.getByLabel("Days to expiry").fill("30");
  await page.getByLabel("Volatility (% per year)").fill("20");
  await page.getByLabel("Risk-free rate (% per year)").fill("6");
  await page.getByLabel("Dividend yield (% per year)").fill("0");
  await calculate(page);

  await expect(page.getByText("₹5.23").first()).toBeVisible();
});

test("GreekMap ignores unknown query fields and unlisted premium data", async ({ page }) => {
  await page.goto(
    "/tools/greek-map?type=call&strike=100&spot=100&premium=8&dte=30&volatility=20&rate=6&dividend=1&direction=long&foo=bar",
  );

  await expect(page.getByLabel("Spot (₹)")).toHaveValue("100");
  await expect(page.getByLabel("Your premium (₹, optional)")).toHaveValue("");
  await page.getByLabel("Days to expiry").fill("30");
  await page.getByLabel("Volatility (% per year)").fill("20");
  await page.getByLabel("Risk-free rate (% per year)").fill("6");
  await page.getByLabel("Dividend yield (% per year)").fill("0");
  await calculate(page);

  // The premium from the URL never entered the comparison.
  await expect(page.getByText("Model comparison")).toHaveCount(0);
});

test("GreekMap drops narrative and malformed handoff values", async ({ page }) => {
  await page.goto(
    "/tools/greek-map?type=straddle&spot=abc&strike=0&expiryLabel=HACKED&narrative=buy-now",
  );

  await expect(page.getByLabel("Spot (₹)")).toHaveValue("");
  await expect(page.getByLabel("Strike (₹)")).toHaveValue("");
  await expect(page.getByLabel("Expiry label (optional)")).toHaveValue("");
  await expect(page.getByLabel("CE (Call)")).toBeChecked();
  await expect(page.getByText("Values carried forward")).toHaveCount(0);
});

test("GreekMap keeps every field editable after a handoff", async ({ page }) => {
  await page.goto("/tools/greek-map?type=put&strike=105&spot=100");

  await page.getByLabel("Spot (₹)").fill("200");
  await page.getByLabel("Strike (₹)").fill("190");
  await page.getByLabel("Days to expiry").fill("45");
  await page.getByLabel("Volatility (% per year)").fill("25");
  await page.getByLabel("Risk-free rate (% per year)").fill("5");
  await page.getByLabel("Dividend yield (% per year)").fill("1");
  await page.getByLabel("Expiry label (optional)").fill("NIFTY 30 OCT");
  await calculate(page);

  await expect(page.getByText("Model value").first()).toBeVisible();
  await expect(page.getByLabel("Spot (₹)")).toHaveValue("200");
});

test("GreekMap has no automated accessibility violations", async ({ page }) => {
  await page.goto("/tools/greek-map");
  await fillValidCall(page);
  await calculate(page);

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
  test(`GreekMap has no overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/tools/greek-map");
    await fillValidCall(page);
    await page.getByLabel("Your premium (₹, optional)").fill("3");
    await calculate(page);

    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > window.innerWidth;
    });
    expect(overflow).toBe(false);
  });
}

test("GreekMap respects reduced motion and keeps touch targets usable", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tools/greek-map");
  await fillValidCall(page);
  await calculate(page);

  await expect(page.getByText("Model value").first()).toBeVisible();
  const submitBox = await page.getByRole("button", { name: "Calculate model" }).boundingBox();
  expect(submitBox?.height).toBeGreaterThanOrEqual(44);
});
