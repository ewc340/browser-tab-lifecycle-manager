import { defineConfig } from "@playwright/test";

/**
 * Playwright E2E for the unpacked extension.
 *
 * Opens chrome-extension://<id>/sidepanel.html as a normal tab (review F6).
 * Requires a prior `npm run build` — see e2e/global-setup.ts.
 *
 * Run: npm run build && npm run e2e
 * CI:  xvfb-run npm run e2e
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 1,
  reporter: process.env.CI ? [["github"], ["list"]] : [["list"]],
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
