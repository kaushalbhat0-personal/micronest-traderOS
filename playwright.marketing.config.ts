import { defineConfig, devices } from "@playwright/test";

/**
 * Marketing screenshot capture (UI-6B). Chromium-only, fixed 1440x900 CSS at
 * deviceScaleFactor 2, reduced motion enforced. The production server is
 * managed by `pnpm screenshots:marketing`; BASE_URL is an explicit override
 * for controlled inspection only (never production traffic by default).
 */
const baseURL = process.env.MKT_BASE_URL ?? "http://127.0.0.1:3100";

export default defineConfig({
  testDir: "./e2e/marketing",
  outputDir: "./marketing-artifacts/test-output",
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    trace: "retain-on-failure",
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    reducedMotion: "reduce",
  },
  projects: [{ name: "marketing" }],
});
