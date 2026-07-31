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
import { SIDE_PANEL_TOGGLE_CLOSE } from "../shared/messages.ts";

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

// Last focused normal window — lets us call sidePanel.open() synchronously inside
// commands.onCommand without losing the user-gesture token to an async tabs.query.
let lastFocusedNormalWindowId: number | undefined;

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  chrome.windows.get(windowId, (win) => {
    if (chrome.runtime.lastError || win.id === undefined) return;
    if (win.type === "normal") lastFocusedNormalWindowId = win.id;
  });
});

// Seed on service-worker start so the first shortcut press works immediately.
chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (win) => {
  if (win.id !== undefined) lastFocusedNormalWindowId = win.id;
});

/**
 * Toggles the side panel for the focused window.
 *
 * Chrome has no sidePanel.toggle(). Toolbar clicks toggle via setPanelBehavior,
 * but keyboard shortcuts use a separate command. Pattern: ask any open panel to
 * window.close() on a short delay, then call open() synchronously (a no-op when
 * already open, opens when closed).
 */
function toggleSidePanelForFocusedWindow(): void {
  chrome.runtime.sendMessage(SIDE_PANEL_TOGGLE_CLOSE).catch(() => {});

  if (lastFocusedNormalWindowId !== undefined) {
    chrome.sidePanel.open({ windowId: lastFocusedNormalWindowId }).catch((e: unknown) => {
      log.error("sidePanel.open failed", e);
    });
    return;
  }

  chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (win) => {
    if (win.id === undefined) return;
    lastFocusedNormalWindowId = win.id;
    chrome.sidePanel.open({ windowId: win.id }).catch((e: unknown) => {
      log.error("sidePanel.open failed", e);
    });
  });
}

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-side-panel") {
    toggleSidePanelForFocusedWindow();
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
