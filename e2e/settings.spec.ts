import { expect, test } from "./fixtures/extension.ts";

test.describe("settings view", () => {
  test.beforeEach(async ({ panelPage }) => {
    await panelPage.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(panelPage.locator(".settings-view")).toBeVisible({ timeout: 30_000 });
  });

  test("renders core sections and controls", async ({ panelPage }) => {
    await expect(panelPage.getByRole("heading", { name: "Automation control", level: 2 })).toBeVisible();
    await expect(panelPage.getByRole("heading", { name: "Automatic sleeping", level: 2 })).toBeVisible();
    await expect(panelPage.getByRole("heading", { name: "Automatic closure", level: 2 })).toBeVisible();
    await expect(panelPage.getByRole("heading", { name: "History", level: 2 })).toBeVisible();
    await expect(panelPage.getByRole("heading", { name: "Appearance", level: 2 })).toBeVisible();

    await expect(panelPage.getByLabel("Automatically sleep inactive tabs")).toBeVisible();
    await expect(panelPage.getByLabel("Automatically close inactive tabs")).toBeVisible();
    await expect(
      panelPage.getByRole("checkbox", { name: /Store closed-tab URLs in recovery/ }),
    ).toBeVisible();
    await expect(panelPage.getByLabel("Theme")).toBeVisible();
  });

  test("host rule editor adds and removes entries", async ({ panelPage }) => {
    const host = `e2e-${Date.now()}.example`;
    const sleepSection = panelPage.locator(".settings-section").filter({
      hasText: "Never sleep these sites",
    });
    const addInput = sleepSection.getByPlaceholder("example.com or *.example.com");
    await addInput.fill(host);
    await sleepSection.getByRole("button", { name: "Add", exact: true }).click();

    const row = sleepSection.getByRole("listitem").filter({ hasText: host });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: `Remove ${host}` }).click();
    await expect(row).toHaveCount(0);

    const stored = await panelPage.evaluate(async () => {
      const result = await chrome.storage.local.get("settings:v1");
      const settings = result["settings:v1"] as { neverSleepHosts?: string[] } | undefined;
      return settings?.neverSleepHosts ?? [];
    });
    expect(stored).not.toContain(host);
  });

  test("retention inputs are laid out and editable", async ({ panelPage }) => {
    const activityRetention = panelPage.getByRole("spinbutton", { name: "Activity retention (days)" });
    const recoveryRetention = panelPage.getByRole("spinbutton", { name: "Recovery retention (days)" });

    await expect(activityRetention).toBeVisible();
    await expect(recoveryRetention).toBeVisible();

    const activityBox = await activityRetention.boundingBox();
    const recoveryBox = await recoveryRetention.boundingBox();
    expect(activityBox).not.toBeNull();
    expect(recoveryBox).not.toBeNull();
    if (activityBox && recoveryBox) {
      expect(Math.abs(activityBox.y - recoveryBox.y)).toBeLessThan(80);
    }

    await activityRetention.fill("45");
    await recoveryRetention.fill("60");
    await activityRetention.blur();

    await panelPage.reload({ waitUntil: "domcontentloaded" });
    await panelPage.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(panelPage.getByRole("spinbutton", { name: "Activity retention (days)" })).toHaveValue("45");
    await expect(panelPage.getByRole("spinbutton", { name: "Recovery retention (days)" })).toHaveValue("60");
  });
});
