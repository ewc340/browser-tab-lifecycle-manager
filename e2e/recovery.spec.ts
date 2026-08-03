import { startTestHttpServer, stopTestHttpServer } from "./helpers/http-server.ts";
import { reloadPanel } from "./helpers/panel.ts";
import { expect, test } from "./fixtures/extension.ts";

test.describe("recovery flow", () => {
  test("restore reopens a tab from the recovery list", async ({ panelPage }) => {
    const http = await startTestHttpServer();
    const testUrl = http.pageUrl("recovery-target");

    try {
      const seeded = await panelPage.evaluate(async (url) => {
        const now = Date.now();
        const recoveryId = crypto.randomUUID();
        await chrome.storage.local.set({
          "recoveryRecords:v1": [
            {
              id: recoveryId,
              closedAt: now,
              expiresAt: now + 30 * 24 * 60 * 60 * 1000,
              title: "E2E Recovery Target",
              url,
              closeReason: "Inactive for at least 60 minutes",
              closeRuleMinutes: 60,
            },
          ],
        });

        const listed = await chrome.runtime.sendMessage({
          v: 1,
          request: { type: "GET_RECOVERY" },
        });
        return {
          recoveryId,
          count: listed?.data?.records?.length ?? 0,
        };
      }, testUrl);

      expect(seeded.count).toBeGreaterThan(0);

      await reloadPanel(panelPage);
      await panelPage.getByRole("button", { name: "Recovery", exact: true }).click();
      await expect(panelPage.getByText("E2E Recovery Target")).toBeVisible({ timeout: 15_000 });

      await panelPage.getByRole("button", { name: "Restore", exact: true }).first().click();

      await expect
        .poll(async () =>
          panelPage.evaluate(async (targetUrl) => {
            const tabs = await chrome.tabs.query({});
            return tabs.some((tab) => tab.url?.startsWith(targetUrl));
          }, testUrl),
        )
        .toBe(true);
    } finally {
      await stopTestHttpServer(http);
    }
  });
});
