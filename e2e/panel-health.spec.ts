import { expect, test } from "./fixtures/extension.ts";

/** Max time for the panel shell (header + nav) to become interactive. */
const PANEL_SHELL_MS = 15_000;

/** Max time for GET_APP_STATE to populate the main view area. */
const PANEL_DATA_MS = 30_000;

test.describe("panel health", () => {
  test("shell loads within SLA", async ({ panelPage }) => {
    const started = Date.now();
    await expect(panelPage.getByRole("heading", { name: "Tab Lifecycle", level: 1 })).toBeVisible({
      timeout: PANEL_SHELL_MS,
    });
    await expect(panelPage.getByRole("navigation", { name: "Views" })).toBeVisible({
      timeout: PANEL_SHELL_MS,
    });
    expect(Date.now() - started).toBeLessThan(PANEL_SHELL_MS);
  });

  test("tab data loads without hanging on Loading", async ({ panelPage }) => {
    await expect(panelPage.getByText("Loading…", { exact: true })).toBeHidden({
      timeout: 10_000,
    });
    await expect(panelPage.locator(".app__main")).not.toBeEmpty({ timeout: 10_000 });
  });

  test("reopen shows cached tabs quickly", async ({ panelPage }) => {
    await expect(panelPage.getByText("Loading…", { exact: true })).toBeHidden({
      timeout: 10_000,
    });

    await panelPage.reload({ waitUntil: "domcontentloaded" });
    const started = Date.now();
    await expect(panelPage.getByRole("heading", { name: "Tab Lifecycle", level: 1 })).toBeVisible({
      timeout: 5_000,
    });
    await expect(panelPage.getByText("Loading…", { exact: true })).toBeHidden({ timeout: 5_000 });
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  test("shipped CSS applies settings and button styles", async ({ panelPage }) => {
    await panelPage.getByRole("button", { name: "Settings", exact: true }).click();

    const settingsView = panelPage.locator(".settings-view");
    await expect(settingsView).toBeVisible({ timeout: PANEL_DATA_MS });

    const settingsPadding = await settingsView.evaluate((el) => getComputedStyle(el).paddingTop);
    expect(parseFloat(settingsPadding)).toBeGreaterThan(0);

    const ghostButton = panelPage.getByRole("button", { name: "Pause automatic management" });
    await expect(ghostButton).toBeVisible();
    const borderWidth = await ghostButton.evaluate((el) => getComputedStyle(el).borderTopWidth);
    expect(parseFloat(borderWidth)).toBeGreaterThan(0);
  });
});
