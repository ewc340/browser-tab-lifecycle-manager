/**
 * Context menu registration and click routing.
 *
 * Menus are rebuilt from scratch on every install/update so duplicate entries
 * never accumulate across extension reloads.
 */
import { STRINGS } from "../shared/strings.ts";
import { sleepTabs } from "./tab-actions.ts";
import { isTabLocked, lockTabs, unlockTabs } from "./lock-service.ts";
import { broadcast } from "./messaging.ts";
import { taskQueue } from "./task-queue.ts";
import * as log from "../shared/log.ts";

const MENU_LOCK = "tlm-lock-tab";
const MENU_UNLOCK = "tlm-unlock-tab";
const MENU_SLEEP = "tlm-sleep-tab";

export function initContextMenus(): void {
  chrome.runtime.onInstalled.addListener(() => {
    rebuildContextMenus().catch((e: unknown) => log.error("rebuildContextMenus failed", e));
  });

  // Also rebuild on worker startup so a reload before onInstalled still has menus.
  rebuildContextMenus().catch((e: unknown) => log.error("rebuildContextMenus failed", e));
}

export async function rebuildContextMenus(): Promise<void> {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({
    id: MENU_LOCK,
    title: STRINGS.lock.contextMenuLock,
    contexts: ["page", "action"],
  });
  chrome.contextMenus.create({
    id: MENU_UNLOCK,
    title: STRINGS.lock.contextMenuUnlock,
    contexts: ["page", "action"],
  });
  chrome.contextMenus.create({
    id: MENU_SLEEP,
    title: STRINGS.sleep.contextMenu,
    contexts: ["page", "action"],
  });
}

export function initContextMenuClicks(): void {
  chrome.contextMenus.onClicked.addListener((info, tab) => {
    const tabId = tab?.id;
    if (tabId === undefined) return;

    taskQueue
      .push(async () => {
        if (info.menuItemId === MENU_LOCK) {
          await lockTabs([tabId]);
        } else if (info.menuItemId === MENU_UNLOCK) {
          await unlockTabs([tabId]);
        } else if (info.menuItemId === MENU_SLEEP) {
          await sleepTabs([tabId]);
        } else {
          return;
        }
        broadcast({ type: "APP_STATE_CHANGED" });
      })
      .catch((e: unknown) => log.error("context menu action failed", e));
  });
}

export async function handleToggleLockCommand(): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tabId = tabs[0]?.id;
  if (tabId === undefined) return;

  if (await isTabLocked(tabId)) {
    await unlockTabs([tabId]);
  } else {
    await lockTabs([tabId]);
  }
  broadcast({ type: "APP_STATE_CHANGED" });
}
