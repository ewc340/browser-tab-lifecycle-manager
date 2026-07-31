/**
 * Service-worker entry point.
 *
 * ALL listeners must be registered synchronously at the top level of this
 * module so Chrome can wake the worker when an event fires (MV3 requirement).
 * No async work at the top level — that would delay listener registration and
 * could silently drop events.
 */
import * as log from "../shared/log.ts";
import { initListeners } from "./listeners.ts";
import { initMessaging } from "./messaging.ts";
import {
  initContextMenuClicks,
  initContextMenus,
  handleToggleLockCommand,
} from "./context-menu-service.ts";
import { taskQueue } from "./task-queue.ts";
import {
  handleBrowserStartup,
  handleExtensionInstall,
} from "./reconciliation-service.ts";
import { isLifecycleAlarm } from "./alarm-service.ts";
import { runLifecycleSweep } from "./lifecycle-sweep.ts";

// ── Register all Chrome event listeners synchronously ─────────────────────────

initListeners();
initMessaging();
initContextMenus();
initContextMenuClicks();

// ── Side-panel behaviour ──────────────────────────────────────────────────────

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e: unknown) => {
  log.error("setPanelBehavior failed", e);
});

// ── Extension lifecycle ───────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((e: unknown) => {
    log.error("setPanelBehavior (onInstalled) failed", e);
  });

  if (reason === "install") {
    chrome.tabs
      .create({ url: chrome.runtime.getURL("onboarding.html") })
      .catch((e: unknown) => log.error("Failed to open onboarding tab", e));
  }

  taskQueue
    .push(async () => {
      await handleExtensionInstall(reason);
    })
    .catch((e: unknown) => log.error("onInstalled handler failed", e));

  log.info("onInstalled", reason);
});

chrome.runtime.onStartup.addListener(() => {
  log.info("onStartup");
  taskQueue
    .push(async () => {
      await handleBrowserStartup();
    })
    .catch((e: unknown) => log.error("onStartup handler failed", e));
});

/**
 * Opens the side panel for the focused window. Must not await before
 * sidePanel.open() — the user-gesture token from the keyboard command expires
 * within the same event-loop turn.
 */
function openSidePanelForFocusedWindow(): void {
  chrome.tabs.query({ active: true, lastFocusedWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.windowId === undefined) return;
    chrome.sidePanel.open({ windowId: tab.windowId }).catch((e: unknown) => {
      log.error("sidePanel.open failed", e);
    });
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-side-panel") {
    openSidePanelForFocusedWindow();
    return;
  }
  if (command !== "toggle-tab-keep") return;
  taskQueue
    .push(async () => {
      await handleToggleLockCommand();
    })
    .catch((e: unknown) => log.error("toggle-tab-keep command failed", e));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!isLifecycleAlarm(alarm)) return;
  taskQueue
    .push(async () => {
      await runLifecycleSweep({ trigger: "alarm" });
    })
    .catch((e: unknown) => log.error("lifecycle alarm handler failed", e));
});
