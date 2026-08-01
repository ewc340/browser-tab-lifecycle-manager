import { startTestHttpServer, stopTestHttpServer } from "./helpers/http-server.ts";
import {
  openTestTab,
  reloadPanel,
  syncPanelInventory,
  waitForTabRowHidden,
} from "./helpers/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

test.describe("tab row actions", () => {
  test("shows the sleep quick action on a tracked tab", async ({ panelPage }) => {
    const http = await startTestHttpServer();
    const testUrl = http.pageUrl("sleep-target");

    try {
      await openTestTab(panelPage, testUrl);
      await syncPanelInventory(panelPage, "E2E Sleep Target");
      await expect(
        panelPage.getByRole("button", { name: "Sleep E2E Sleep Target" }),
      ).toBeVisible();
    } finally {
      await stopTestHttpServer(http);
    }
  });

  test("locks a tab from the overflow menu", async ({ panelPage }) => {
    const http = await startTestHttpServer();
    const testUrl = http.pageUrl("lock-target");

    try {
      await openTestTab(panelPage, testUrl);
      await syncPanelInventory(panelPage, "E2E Lock Target");

      await panelPage.getByRole("button", { name: "More actions for E2E Lock Target" }).click();
      await panelPage.getByRole("menuitem", { name: "Lock from automatic closure" }).click();
      await reloadPanel(panelPage);

      await panelPage.getByRole("button", { name: "More actions for E2E Lock Target" }).click();
      await expect(panelPage.getByRole("menuitem", { name: "Unlock" })).toBeVisible();
    } finally {
      await stopTestHttpServer(http);
    }
  });

  test("closes a tab from the quick action", async ({ panelPage }) => {
    const http = await startTestHttpServer();
    const testUrl = http.pageUrl("close-target");

    try {
      await openTestTab(panelPage, testUrl);
      await syncPanelInventory(panelPage, "E2E Close Target");

      await panelPage.getByRole("button", { name: "Close E2E Close Target" }).click();

      await reloadPanel(panelPage);
      await waitForTabRowHidden(panelPage, "E2E Close Target");
    } finally {
      await stopTestHttpServer(http);
    }
  });
});
