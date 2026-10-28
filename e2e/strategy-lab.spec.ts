import { expect, test } from "@playwright/test";

/**
 * M1-F read-only Strategy Lab research report. Rendering assertions only —
 * every figure on the page is consumed from the frozen M1-E result.
 */

test("/lab renders one h1, the warning, and the reference leg with no console errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    errors.push(error.message);
  });

  const response = await page.goto("/lab");

  expect(response?.status()).toBe(200);
  await expect(page.getByRole("heading", { level: 1, name: "Strategy Lab" })).toBeVisible();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByText(/synthetic fixture dataset.*engineering validation/i)).toBeVisible();
  await expect(page.getByText("SLAB-STRAT-001")).toBeVisible();
  await expect(page.getByText("2026-09-14").first()).toBeVisible();
  await expect(page.getByText("Reference").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test.describe("responsive layout", () => {
  for (const width of [360, 390, 768, 1280]) {
    test(`no horizontal overflow at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/lab");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );

      expect(overflow).toBeLessThanOrEqual(1);
    });
  }
});

test("skip link moves focus to main content", async ({ page }) => {
  await page.goto("/lab");

  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});
