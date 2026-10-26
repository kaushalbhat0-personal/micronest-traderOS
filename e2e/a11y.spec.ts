import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const PAGES = ["/", "/tools", "/tools/risk-guard", "/tools/trade-plan", "/pricing", "/disclaimer"] as const;

test("key pages have no automated accessibility violations", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(path);

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();

    expect(results.violations, `${path}\n${JSON.stringify(results.violations, null, 2)}`).toEqual(
      [],
    );
  }
});
