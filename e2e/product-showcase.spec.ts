import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const SHOWCASE = {
  RiskGuard: {
    image: "risk-guard.webp",
    alt: /200 allowed units/,
    outcome: /200 units within a/,
    href: "/tools/risk-guard",
  },
  TradePlan: {
    image: "trade-plan.webp",
    alt: /2\.00 reward-to-risk/,
    outcome: /2\.00 reward-to-risk/,
    href: "/tools/trade-plan",
  },
  TradeCost: {
    image: "trade-cost.webp",
    alt: /1,906\.23 net P&L/,
    outcome: /1,906\.23 after/,
    href: "/tools/trade-cost",
  },
  StrikeLens: {
    image: "strike-lens.webp",
    alt: /95 and 105 CE/,
    outcome: /95 CE and 105 CE/,
    href: "/tools/strike-lens",
  },
  GreekMap: {
    image: "greek-map.webp",
    alt: /2\.54 model value/,
    outcome: /2\.54/,
    href: "/tools/greek-map",
  },
} as const;

type ToolName = keyof typeof SHOWCASE;

test("showcase renders with RiskGuard selected by default", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 2, name: "See the real product" })).toBeVisible();

  const group = page.getByRole("group", { name: "Choose a tool to preview" });
  await expect(group.getByRole("button", { name: "RiskGuard" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(group.getByRole("button", { name: "TradePlan" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  const image = page.getByTestId("showcase-image");
  await expect(image).toHaveAttribute("src", /risk-guard\.webp/);
  await expect(image).toHaveAttribute("alt", SHOWCASE.RiskGuard.alt);
  await expect(page.getByRole("link", { name: "Open RiskGuard \u2192" })).toHaveAttribute(
    "href",
    "/tools/risk-guard",
  );
});

for (const name of Object.keys(SHOWCASE) as ToolName[]) {
  if (name === "RiskGuard") continue;
  const expected = SHOWCASE[name];
  test(`showcase switches to ${name} with matching screenshot and link`, async ({ page }) => {
    await page.goto("/");

    const group = page.getByRole("group", { name: "Choose a tool to preview" });
    await group.getByRole("button", { name }).click();

    await expect(group.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true");
    await expect(group.getByRole("button", { name: "RiskGuard" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    const image = page.getByTestId("showcase-image");
    await expect(image).toHaveAttribute("src", new RegExp(expected.image.replace(".", "\\.")));
    await expect(image).toHaveAttribute("alt", expected.alt);
    await expect(page.getByText(expected.outcome).first()).toBeVisible();
    await expect(page.getByRole("link", { name: `Open ${name} \u2192` })).toHaveAttribute(
      "href",
      expected.href,
    );
  });
}

test("showcase selectors activate from the keyboard", async ({ page }) => {
  await page.goto("/");

  const group = page.getByRole("group", { name: "Choose a tool to preview" });
  await group.getByRole("button", { name: "TradePlan" }).focus();
  await page.keyboard.press("Enter");

  await expect(group.getByRole("button", { name: "TradePlan" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByTestId("showcase-image")).toHaveAttribute("src", /trade-plan\.webp/);
});

test("showcase keeps one selected state and no page overflow at 360px", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/");

  const group = page.getByRole("group", { name: "Choose a tool to preview" });
  await expect(group).toBeVisible();
  await expect(group.getByRole("button", { name: "GreekMap" })).toBeVisible();
  await group.getByRole("button", { name: "GreekMap" }).click();

  const pressed = await group
    .getByRole("button")
    .evaluateAll(
      (buttons) =>
        buttons.filter((button) => button.getAttribute("aria-pressed") === "true").length,
    );
  expect(pressed).toBe(1);

  const cta = page.getByRole("link", { name: "Open GreekMap \u2192" });
  await expect(cta).toBeVisible();
  const ctaBox = await cta.boundingBox();
  expect(ctaBox?.width).toBeGreaterThan(0);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("showcase stays usable under reduced motion and passes axe", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  const group = page.getByRole("group", { name: "Choose a tool to preview" });
  await expect(page.getByRole("heading", { level: 2, name: "See the real product" })).toBeVisible();
  await group.getByRole("button", { name: "StrikeLens" }).click();
  await expect(page.getByTestId("showcase-image")).toHaveAttribute("src", /strike-lens\.webp/);

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations).toEqual([]);
});
