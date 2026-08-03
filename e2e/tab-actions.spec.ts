import { startTestHttpServer, stopTestHttpServer } from "./helpers/http-server.ts";
import {
  openTestTab,
  openTestTabInBackground,
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
      const sleepButton = panelPage.getByRole("button", { name: "Sleep E2E Sleep Target" });
      await expect(sleepButton).toBeVisible();
      await expect(sleepButton).toHaveAttribute("data-tooltip", "Put tab to sleep to free memory");
      await sleepButton.hover();
      await expect
        .poll(async () =>
          sleepButton.evaluate((el) => getComputedStyle(el, "::after").visibility),
        )
        .toBe("visible");
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

  test("closes multiple tabs from bulk selection", async ({ panelPage }) => {
    const http = await startTestHttpServer();
    const urlA = http.pageUrl("bulk-close-a");
    const urlB = http.pageUrl("bulk-close-b");

    try {
      await openTestTabInBackground(panelPage, urlA, "E2E Bulk Close A");
      await openTestTab(panelPage, urlB);
      await syncPanelInventory(panelPage, "E2E Bulk Close B");

      await panelPage.getByRole("button", { name: "Select tabs" }).click();
      await panelPage.getByRole("button", { name: "Select E2E Bulk Close A — 127.0.0.1" }).click();
      await panelPage.getByRole("button", { name: "Select E2E Bulk Close B — 127.0.0.1" }).click();

      await panelPage.getByRole("button", { name: "Close selected" }).click();
      await expect(panelPage.getByRole("alertdialog")).toBeVisible();
      await expect(panelPage.getByRole("alertdialog")).toContainText("E2E Bulk Close A");
      await expect(panelPage.getByRole("alertdialog")).toContainText("E2E Bulk Close B");
      await panelPage.getByRole("alertdialog").getByRole("button", { name: "Close" }).click();

      await reloadPanel(panelPage);
      await waitForTabRowHidden(panelPage, "E2E Bulk Close A");
      await waitForTabRowHidden(panelPage, "E2E Bulk Close B");
    } finally {
      await stopTestHttpServer(http);
    }
  });
});
