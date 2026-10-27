import { defineConfig, devices } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const port = 3100;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: [/marketing/],
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: isCI ? `pnpm exec next start -p ${port}` : `pnpm exec next dev -p ${port}`,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
