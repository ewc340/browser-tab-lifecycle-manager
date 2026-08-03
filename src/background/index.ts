/**
 * Service-worker entry point.
 *
 * Listeners must register synchronously at the top level so Chrome can wake the
 * worker when an event fires (MV3). No async work at the top level before that.
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
import {
  enableSidePanelOnExistingWindows,
  initSidePanelMode,
  initSidePanelWindowTracking,
  openSidePanelFromUserGesture,
} from "./side-panel-service.ts";
import { initPanelOpenDiagnostics, recordPanelOpenEvent } from "./panel-open-debug.ts";
import { maybePromptShortcutAssignment } from "./shortcut-service.ts";

initListeners();
initMessaging();
initContextMenus();
initContextMenuClicks();
initSidePanelMode();
initSidePanelWindowTracking();
initPanelOpenDiagnostics();

chrome.action.onClicked.addListener((tab) => {
  recordPanelOpenEvent("action_onClicked", `windowId=${tab.windowId}`);
  openSidePanelFromUserGesture(tab.windowId);
});

chrome.runtime.onInstalled.addListener(({ reason }) => {
  void enableSidePanelOnExistingWindows();
  maybePromptShortcutAssignment();

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
  void enableSidePanelOnExistingWindows();
  taskQueue
    .push(async () => {
      await handleBrowserStartup();
    })
    .catch((e: unknown) => log.error("onStartup handler failed", e));
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  lastFocusedWindowId = activeInfo.windowId;
});

let lastFocusedWindowId: number | undefined;

chrome.windows.onFocusChanged.addListener((windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return;
  lastFocusedWindowId = windowId;
});

chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (win) => {
  if (win.id !== undefined) lastFocusedWindowId = win.id;
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "open-side-panel") {
    recordPanelOpenEvent("command_onCommand", "open-side-panel");
    log.debug("open-side-panel command received");
    openSidePanelFromUserGesture(lastFocusedWindowId);
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
