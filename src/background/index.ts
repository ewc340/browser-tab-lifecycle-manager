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
import { initMessaging, broadcast } from "./messaging.ts";

// ── Register all Chrome event listeners synchronously ─────────────────────────

initListeners();
initMessaging();

// ── Side-panel behaviour ──────────────────────────────────────────────────────

// Open the panel when the user clicks the toolbar icon (MV3 sidePanel API).
// sidePanel is Chrome 114+; openPanelOnActionClick/setPanelBehavior is Chrome 116+.
// Both are well below minimum_chrome_version: 121, so there is no compatibility gap.
// The call is at top level AND repeated in onInstalled because Chrome sometimes
// loses this setting after an update. The .catch() is kept as defensive practice.
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

  log.info("onInstalled", reason);
});

chrome.runtime.onStartup.addListener(() => {
  log.info("onStartup");
});

// ── Stub listeners registered now for future milestones ──────────────────────
// MV3 requires synchronous top-level registration. Handlers that add behaviour
// later can be empty stubs; what matters is that the registration itself happens.

chrome.contextMenus.onClicked.addListener((info) => {
  log.debug("contextMenu clicked", info.menuItemId);
});

chrome.commands.onCommand.addListener((command) => {
  log.debug("command", command);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  log.debug("alarm fired", alarm.name);
  broadcast({ type: "APP_STATE_CHANGED" });
});
