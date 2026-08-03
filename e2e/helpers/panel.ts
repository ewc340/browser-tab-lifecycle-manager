import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Main row button for a tab (distinct from Sleep/Snooze/Close quick actions). */
export function tabRowMain(panelPage: Page, title: string, host = "127.0.0.1"): Locator {
  return panelPage.getByRole("button", { name: `${title} — ${host}` });
}

export async function waitForTabRow(
  panelPage: Page,
  title: string,
  host = "127.0.0.1",
): Promise<void> {
  await expect(tabRowMain(panelPage, title, host)).toBeVisible({ timeout: 20_000 });
}

export async function waitForTabRowHidden(
  panelPage: Page,
  title: string,
  host = "127.0.0.1",
): Promise<void> {
  await expect(tabRowMain(panelPage, title, host)).toHaveCount(0, { timeout: 20_000 });
}

async function waitForTabTitleInAppState(panelPage: Page, title: string): Promise<void> {
  await expect
    .poll(
      async () =>
        panelPage.evaluate(async (needle) => {
          const response = await chrome.runtime.sendMessage({
            v: 1,
            request: { type: "GET_APP_STATE" },
          });
          const tabs = response?.data?.tabs ?? [];
          return tabs.some((tab: { title: string }) => tab.title.includes(needle));
        }, title),
      { timeout: 30_000 },
    )
    .toBe(true);
}

export async function syncPanelInventory(panelPage: Page, title: string): Promise<void> {
  await waitForTabTitleInAppState(panelPage, title);
  await reloadPanel(panelPage);
  await waitForTabRow(panelPage, title);
}

export async function reloadPanel(panelPage: Page): Promise<void> {
  await panelPage.reload({ waitUntil: "domcontentloaded", timeout: 15_000 });
  await panelPage
    .getByRole("heading", { name: "Tab Lifecycle", level: 1 })
    .waitFor({ timeout: 15_000 });
}

export async function openTestTab(
  panelPage: Page,
  url: string,
  options?: { active?: boolean },
): Promise<void> {
  await panelPage.evaluate(
    async ({ targetUrl, active }) => {
      await chrome.tabs.create({ url: targetUrl, active: active ?? true });
    },
    { targetUrl: url, active: options?.active ?? true },
  );
}

export async function closeBrowserTab(panelPage: Page, url: string): Promise<void> {
  await panelPage.evaluate(async (targetUrl) => {
    const tabs = await chrome.tabs.query({});
    const matches = tabs.filter((tab) => tab.url?.startsWith(targetUrl));
    const tabId = matches[0]?.id;
    if (tabId !== undefined) {
      await chrome.tabs.remove(tabId);
    }
  }, url);
}

export async function openTestTabInBackground(
  panelPage: Page,
  url: string,
  title: string,
): Promise<void> {
  await openTestTab(panelPage, "about:blank", { active: true });
  await openTestTab(panelPage, url, { active: false });
  await syncPanelInventory(panelPage, title);
}

/** Skip onboarding/report-only gates so automation actions work in E2E. */
export async function seedAutomationEnabled(panelPage: Page): Promise<void> {
  await panelPage.evaluate(async () => {
    const now = Date.now();
    const version = chrome.runtime.getManifest().version;
    await chrome.storage.local.set({
      "settings:v1": {
        schemaVersion: 1,
        onboardingCompleted: true,
        automationPaused: false,
        sleepEnabled: true,
        autoCloseEnabled: true,
        sleepAfterMinutes: 60,
        closeAfterMinutes: 60,
        closeGraceMinutes: 1,
        lockImpliesKeepLoaded: false,
        neverSleepHosts: [],
        neverCloseHosts: [],
        activityRetentionDays: 30,
        recoveryRetentionDays: 30,
        maximumActivityEvents: 1000,
        maximumRecoveryRecords: 500,
        storeClosedTabUrls: true,
        showInPanelToasts: true,
        theme: "system",
      },
      "runtimeState:v1": {
        browserStartedAt: now - 2 * 60 * 60 * 1000,
        lastSweepCompletedAt: now - 60_000,
        lastRetentionRunAt: 0,
        reportOnlyUntil: 0,
        lastKnownVersion: version,
        whatsNewVersion: version,
        whatsNewSeenVersion: version,
      },
    });
  });
}

export async function openPanel(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/sidepanel.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.getByRole("heading", { name: "Tab Lifecycle", level: 1 }).waitFor();
  return page;
}
