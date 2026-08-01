import { startTestHttpServer, stopTestHttpServer } from "./helpers/http-server.ts";
import {
  closeBrowserTab,
  openTestTab,
  reloadPanel,
  syncPanelInventory,
  waitForTabRowHidden,
} from "./helpers/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

test.describe("side panel inventory", () => {
  test("reflects tab creation and closure", async ({ panelPage }) => {
    const http = await startTestHttpServer();
    const testUrl = http.pageUrl("alpha-tab");

    try {
      await openTestTab(panelPage, testUrl);
      await syncPanelInventory(panelPage, "E2E Alpha Tab");

      await closeBrowserTab(panelPage, testUrl);
      await reloadPanel(panelPage);
      await waitForTabRowHidden(panelPage, "E2E Alpha Tab");
    } finally {
      await stopTestHttpServer(http);
    }
  });

  test("navigates between Tabs, Activity, and Recovery views", async ({ panelPage }) => {
    await panelPage.getByRole("button", { name: "Activity", exact: true }).click();
    await expect(panelPage.getByRole("tab", { name: "All" })).toBeVisible();

    await panelPage.getByRole("button", { name: "Recovery", exact: true }).click();
    await expect(
      panelPage.getByText("No recoverable tabs. Automatically closed tabs appear here."),
    ).toBeVisible();

    await panelPage.getByRole("button", { name: "Tabs", exact: true }).click();
    await expect(panelPage.getByRole("navigation", { name: "Views" })).toBeVisible();
  });
});
