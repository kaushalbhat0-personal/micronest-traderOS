/**
 * Deterministic marketing screenshot pipeline (UI-6B).
 *
 * Drives the real product UI with synthetic fixtures, captures the approved
 * work-area elements at 1440x900 @2x, converts PNG masters to WebP marketing
 * assets. Run via `pnpm screenshots:marketing` (local production server).
 * Never hits production; never reimplements tool math.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page, test } from "@playwright/test";
import sharp from "sharp";

import { MARKETING_FIXTURES, type MarketingFixture, type MarketingStep } from "./fixtures";

const MASTER_WIDTH = 2880;
const MASTER_HEIGHT = 1800;
const WEBP_QUALITY = 82;
/** Column gap (gap-6) in device px at @2x, reused for the GreekMap composite. */
const GRID_GAP_DEVICE_PX = 48;

const ARTIFACTS_DIR = "marketing-artifacts/masters";
const PRODUCT_DIR = "public/product";

/**
 * Phrases that must never appear as affirmative marketing claims. Negated
 * safety language ("not a forecast", "never recommends") is allowed and
 * explicitly distinguished by the negation guard below.
 */
const BANNED_PHRASES = [
  "predict",
  "predicted",
  "prediction",
  "best strike",
  "best option",
  "signal",
  "guaranteed",
  "guarantee",
  "ai-powered",
  "cheap",
  "expensive",
  "fair value",
  "recommended",
  "recommendation",
  "optimal",
  "ideal",
  "profitable",
  "likely",
  "expected return",
] as const;

const NEGATION = /\b(not|no|never|n't|without|don't|doesn't|does not|isn't|aren't|won't|can't)\b/i;

function findUnnegatedHits(text: string): string[] {
  const lower = text.toLowerCase();
  const hits: string[] = [];
  for (const phrase of BANNED_PHRASES) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(phrase, from);
      if (at === -1) break;
      // Negation may sit a clause away ("does not predict prices, generate
      // signals") — scan back far enough to catch the governing negation
      // without masking a genuinely affirmative claim nearby.
      const before = lower.slice(Math.max(0, at - 64), at);
      if (!NEGATION.test(before) && !hits.includes(phrase)) hits.push(phrase);
      from = at + phrase.length;
    }
  }
  return hits;
}

async function drive(page: Page, step: MarketingStep): Promise<void> {
  switch (step.kind) {
    case "fill":
      await page.getByLabel(step.label).fill(step.value);
      break;
    case "fillNth":
      await page.getByLabel(step.label).nth(step.index).fill(step.value);
      break;
    case "checkRadio":
      await page.getByRole("radio", { name: step.name }).check();
      break;
    case "clickButton":
      await page.getByRole("button", { name: step.name }).click();
      break;
  }
}

async function sampleBackground(png: Buffer): Promise<{ r: number; g: number; b: number }> {
  const { data } = await sharp(png)
    .extract({ left: 0, top: 0, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { r: data[0] ?? 250, g: data[1] ?? 247, b: data[2] ?? 242 };
}

/** Normalize any master to exactly 2880x1800 without cropping or distortion. */
async function toMaster(png: Buffer, background: { r: number; g: number; b: number }) {
  const fitted = await sharp(png)
    .resize(MASTER_WIDTH, MASTER_HEIGHT, { fit: "inside", withoutEnlargement: true })
    .toBuffer();
  const meta = await sharp(fitted).metadata();
  const padRight = MASTER_WIDTH - (meta.width ?? MASTER_WIDTH);
  const padBottom = MASTER_HEIGHT - (meta.height ?? MASTER_HEIGHT);
  return sharp({
    create: {
      width: MASTER_WIDTH,
      height: MASTER_HEIGHT,
      channels: 4,
      background: { ...background, alpha: 1 },
    },
  })
    .composite([{ input: fitted, left: 0, top: 0 }])
    .webp({ quality: WEBP_QUALITY })
    .toBuffer()
    .then((buffer) => ({ buffer, padRight, padBottom }));
}

function resultSection(page: Page, fixture: MarketingFixture): Locator {
  return page.locator(`section[aria-labelledby="${fixture.resultSection}"]`);
}

async function assertNoOverflow(locator: Locator, label: string): Promise<void> {
  const overflow = await locator.evaluate((el) => {
    const bad: string[] = [];
    el.querySelectorAll("dl, dd, dt").forEach((node, i) => {
      // Collapsed disclosure content is laid out but not rendered — it can
      // report scrollWidth without any visible overflow. Only rendered
      // content can actually clip in the screenshot.
      const details = node.closest("details");
      if (details && !details.open) return;
      if (node.getBoundingClientRect().width === 0) return;
      if (node.scrollWidth - node.clientWidth > 1) {
        bad.push(`${node.tagName}#${i}:+${node.scrollWidth - node.clientWidth}px`);
      }
    });
    return {
      bad,
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  expect(overflow.bad, `${label} receipt overflow`).toEqual([]);
  expect(overflow.doc, `${label} page overflow`).toBeLessThanOrEqual(1);
}

for (const fixture of MARKETING_FIXTURES) {
  test(`${fixture.tool} marketing capture`, async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const failedRequests: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) failedRequests.push(`${response.status()} ${response.url()}`);
    });

    await page.goto(fixture.route);

    // Styled-render sentinel: the header nav link must have its 44px
    // min-height applied. This fails fast and clearly if the server is
    // ever racing a rebuild (unstyled DOM would poison axe + capture).
    const navLink = page.locator('header a[href="/tools"]').first();
    await expect(navLink, `${fixture.tool} nav renders`).toBeVisible();
    await expect
      .poll(async () => (await navLink.boundingBox())?.height ?? 0, {
        message: `${fixture.tool} styles applied (nav link 44px tall)`,
      })
      .toBeGreaterThanOrEqual(43.5);

    for (const step of fixture.steps) await drive(page, step);
    for (const pattern of fixture.waits) {
      await expect(
        page.getByText(pattern).first(),
        `${fixture.tool} waits for ${pattern}`,
      ).toBeVisible();
    }

    // Stability: fonts loaded, motion settled (reduced-motion is enforced by
    // config), no focus ring left on the submit control.
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });

    const section = resultSection(page, fixture);
    await expect(section, `${fixture.tool} result section`).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations, `${fixture.tool} axe violations`).toEqual([]);

    const resultText = (await section.innerText()).slice(0, 4000);
    expect(findUnnegatedHits(resultText), `${fixture.tool} banned marketing language`).toEqual([]);

    let master: Buffer;
    if (fixture.capture.kind === "grid") {
      const grid = section.locator("xpath=..");
      const box = await grid.boundingBox();
      expect(box, `${fixture.tool} capture target exists`).not.toBeNull();
      expect(box?.width ?? 0, `${fixture.tool} capture width`).toBeGreaterThan(0);
      expect(box?.height ?? 0, `${fixture.tool} capture height`).toBeGreaterThan(0);
      await assertNoOverflow(grid, fixture.tool);
      master = await grid.screenshot({ type: "png" });
    } else {
      // GreekMap: inputs card + model hero/comparison only — the scenario
      // tail stays out of frame. Both halves are real rendered pixels.
      const inputs = page.locator('section[aria-labelledby="greek-map-inputs-heading"]');
      // Hero is the first plain-Card child of the result stack (spot/time
      // scenario cards are `section` elements; the Card surface class
      // disambiguates from nested content divs). Strict mode fails loudly
      // if this ever stops being unique.
      const hero = page.locator(
        'section[aria-labelledby="greek-map-result-heading"] > div > div.rounded-xl',
      );
      await expect(inputs, "greek-map inputs card").toBeVisible();
      await expect(hero, "greek-map hero card").toBeVisible();
      await assertNoOverflow(inputs, "greek-map inputs");
      const [inputsPng, heroPng] = await Promise.all([
        inputs.screenshot({ type: "png" }),
        hero.screenshot({ type: "png" }),
      ]);
      const [inputsMeta, heroMeta] = await Promise.all([
        sharp(inputsPng).metadata(),
        sharp(heroPng).metadata(),
      ]);
      const background = await sampleBackground(inputsPng);
      const height = Math.max(inputsMeta.height ?? 0, heroMeta.height ?? 0);
      master = await sharp({
        create: {
          width: (inputsMeta.width ?? 0) + GRID_GAP_DEVICE_PX + (heroMeta.width ?? 0),
          height,
          channels: 4,
          background: { ...background, alpha: 1 },
        },
      })
        .composite([
          { input: inputsPng, left: 0, top: 0 },
          { input: heroPng, left: (inputsMeta.width ?? 0) + GRID_GAP_DEVICE_PX, top: 0 },
        ])
        .png()
        .toBuffer();
    }

    const { writeFile, mkdir } = await import("node:fs/promises");
    await mkdir(ARTIFACTS_DIR, { recursive: true });
    await mkdir(PRODUCT_DIR, { recursive: true });
    const masterPath = `${ARTIFACTS_DIR}/${fixture.tool}@2x.png`;
    await writeFile(masterPath, master);

    const background = await sampleBackground(master);
    const { buffer: webp } = await toMaster(master, background);
    const outPath = `${PRODUCT_DIR}/${fixture.tool}.webp`;
    await writeFile(outPath, webp);

    const meta = await sharp(outPath).metadata();
    expect(meta.width, `${fixture.tool} master width`).toBe(MASTER_WIDTH);
    expect(meta.height, `${fixture.tool} master height`).toBe(MASTER_HEIGHT);
    expect(meta.format, `${fixture.tool} format`).toBe("webp");

    expect(consoleErrors, `${fixture.tool} console errors`).toEqual([]);
    expect(pageErrors, `${fixture.tool} page errors`).toEqual([]);
    expect(failedRequests, `${fixture.tool} failed requests`).toEqual([]);
  });
}
