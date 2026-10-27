import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const WORKFLOW_TOOLS = ["TradePlan", "RiskGuard", "TradeCost", "StrikeLens", "GreekMap"] as const;

test("homepage workflow links each step to a live instrument", async ({ page }) => {
  await page.goto("/");

  const workflow = page.getByRole("list", { name: "Decision workflow" });
  await expect(
    page.getByRole("heading", { level: 2, name: "How the tools work together" }),
  ).toBeVisible();

  for (const name of WORKFLOW_TOOLS) {
    const step = workflow.getByRole("listitem").filter({ hasText: name });
    await expect(step).toBeVisible();
  }

  const planStep = workflow.getByRole("link", { name: /Plan · TradePlan/ });
  await expect(planStep).toHaveAttribute("href", "/tools/trade-plan");
  await planStep.click();
  await expect(page).toHaveURL("/tools/trade-plan");
});

test("homepage centers live instruments and keeps planned tools honest", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 2, name: "Five tools you can use today" }),
  ).toBeVisible();

  for (const name of WORKFLOW_TOOLS) {
    await expect(page.getByRole("heading", { level: 3, name })).toBeVisible();
  }

  await expect(page.getByRole("heading", { level: 2, name: "On the bench" })).toBeVisible();
  // Planned cards are honest surfaces: no destination, no interaction.
  const bench = page.locator("section", { hasText: "On the bench" });
  await expect(bench.getByText("Planned", { exact: true })).toHaveCount(5);
  await expect(bench.getByRole("link")).toHaveCount(0);
});

test("homepage trust demo shows the engine-backed StrikeLens illustration", async ({ page }) => {
  await page.goto("/");

  const demo = page.locator("div", {
    has: page.getByRole("heading", { level: 3, name: "Inside every calculation" }),
  });
  await expect(
    page.getByRole("heading", { level: 3, name: "Inside every calculation" }),
  ).toBeVisible();

  // Fixed illustrative inputs.
  await expect(demo.getByText("₹100.00")).toBeVisible();
  await expect(demo.getByText("₹95.00")).toBeVisible();
  await expect(demo.getByText("CE (Call)")).toBeVisible();
  await expect(demo.getByText("₹8.00")).toBeVisible();

  // Engine-derived outputs — these values only render if compareStrikes
  // produces them from the fixed inputs above.
  await expect(demo.getByText("₹5.00", { exact: true })).toBeVisible();
  await expect(demo.getByText("₹3.00", { exact: true })).toBeVisible();
  await expect(demo.getByText("₹103.00", { exact: true })).toBeVisible();

  // Honest framing.
  await expect(demo.getByText("Illustrative example")).toBeVisible();
  await expect(demo.getByText("One fixed example — not market data")).toBeVisible();
  await expect(demo.getByText(/Each tool shows its own calculation basis/)).toBeVisible();

  // Navigation stays correct; the demo carries no live/market signalling
  // and no user-data-shaped content.
  await expect(demo.getByRole("link", { name: "Open StrikeLens" })).toHaveAttribute(
    "href",
    "/tools/strike-lens",
  );
  await expect(demo.getByText("Live", { exact: true })).toHaveCount(0);
  await expect(demo.getByText("Capital")).toHaveCount(0);
  await expect(demo.getByText("Brokerage")).toHaveCount(0);
  await expect(demo.getByText("Breakout")).toHaveCount(0);
});

test("homepage has no automated accessibility violations", async ({ page }) => {
  await page.goto("/");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});

test("homepage content is fully visible under reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  await expect(
    page.getByRole("heading", { level: 2, name: "How the tools work together" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Five tools you can use today" }),
  ).toBeVisible();
  for (const name of WORKFLOW_TOOLS) {
    await expect(page.getByRole("heading", { level: 3, name })).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { level: 3, name: "Inside every calculation" }),
  ).toBeVisible();
  await expect(page.getByText("₹103.00")).toBeVisible();
  const opacity = await page
    .getByRole("heading", { level: 2, name: "Five tools you can use today" })
    .evaluate((element) => getComputedStyle(element.parentElement ?? element).opacity);
  expect(opacity).toBe("1");
});
