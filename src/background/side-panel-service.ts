/**
 * Opens the lifecycle manager UI in the native side panel when available,
 * otherwise in a new tab (Arc and other forks without a working sidePanel).
 */
import * as log from "../shared/log.ts";
import { getSession, setSession } from "./storage.ts";

export const SESSION_KEY_SIDE_PANEL_FALLBACK_TAB = "sidePanelFallbackTabId";
export const SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK = "sidePanelPreferFallback";

const PANEL_PATH = "sidepanel.html";

const SIDE_PANEL_CONTEXT_TYPE = "SIDE_PANEL" as chrome.runtime.ContextType;
const SIDE_PANEL_PROBE_DELAY_MS = 300;

/** Default pessimistic until session or probe confirms native side panel works. */
let popupFallbackMode = true;
/** Cached panel tab id for gesture-safe reopen (no tabs.query before create). */
let panelTabId: number | undefined;

function panelUrl(): string {
  return chrome.runtime.getURL(PANEL_PATH);
}

/**
 * Arc and some Chromium forks expose a broken `chrome.sidePanel` stub. Require the
 * full surface we rely on before attempting native open.
 */
export function isNativeSidePanelApiComplete(): boolean {
  return (
    typeof chrome.sidePanel.open === "function" &&
    typeof chrome.sidePanel.setOptions === "function"
  );
}

function shouldUsePopupFallback(): boolean {
  return popupFallbackMode || !isNativeSidePanelApiComplete();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enablePopupFallbackMode(): void {
  popupFallbackMode = true;
  void setSession({ [SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK]: true });
}

function markNativeSidePanelVerified(): void {
  popupFallbackMode = false;
  void setSession({ [SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK]: false });
}

function rememberPanelTab(tabId: number): void {
  panelTabId = tabId;
  void setSession({ [SESSION_KEY_SIDE_PANEL_FALLBACK_TAB]: tabId });
}

function clearRememberedPanelTab(): void {
  panelTabId = undefined;
  void chrome.storage.session.remove(SESSION_KEY_SIDE_PANEL_FALLBACK_TAB);
}

/**
 * Opens the panel in a browser tab. Uses callback APIs and an in-memory tab id so
 * tabs.create runs immediately on the user-gesture chain (Arc rejects deferred opens).
 */
function openPanelTabFromUserGesture(): void {
  const url = panelUrl();

  if (panelTabId !== undefined) {
    chrome.tabs.get(panelTabId, (tab) => {
      if (chrome.runtime.lastError || tab.id === undefined) {
        clearRememberedPanelTab();
        chrome.tabs.create({ url, active: true }, (created) => {
          if (created.id !== undefined) rememberPanelTab(created.id);
        });
        return;
      }

      void chrome.tabs.update(tab.id, { active: true });
      void chrome.windows.update(tab.windowId, { focused: true });
    });
    return;
  }

  chrome.tabs.create({ url, active: true }, (created) => {
    if (chrome.runtime.lastError) {
      log.error("tabs.create for panel failed", chrome.runtime.lastError.message);
      return;
    }
    if (created.id !== undefined) rememberPanelTab(created.id);
  });
}

/**
 * Probes whether native side panel actually works. Arc exposes a stub that "succeeds"
 * without opening UI; Chrome rejects open() without a user gesture.
 */
async function probeNativeSidePanelSupport(): Promise<void> {
  if (!isNativeSidePanelApiComplete()) {
    enablePopupFallbackMode();
    return;
  }

  const win = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  if (win.id === undefined) return;

  try {
    await chrome.sidePanel.open({ windowId: win.id });
    await delay(SIDE_PANEL_PROBE_DELAY_MS);

    if (typeof chrome.runtime.getContexts !== "function") {
      enablePopupFallbackMode();
      return;
    }

    const contexts = await chrome.runtime.getContexts({
      contextTypes: [SIDE_PANEL_CONTEXT_TYPE],
    });
    if (contexts.length === 0) {
      log.info("sidePanel.open returned but no SIDE_PANEL context — enabling tab fallback");
      enablePopupFallbackMode();
      return;
    }

    markNativeSidePanelVerified();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/user gesture/i.test(msg)) {
      markNativeSidePanelVerified();
      return;
    }
    log.info("sidePanel probe failed — enabling tab fallback", msg);
    enablePopupFallbackMode();
  }
}

async function hydratePopupFallbackMode(): Promise<void> {
  if (!isNativeSidePanelApiComplete()) {
    popupFallbackMode = true;
    return;
  }

  const preferFallback = await getSession<boolean>(SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK, false);
  if (preferFallback) {
    popupFallbackMode = true;
  }
}

async function resolveTargetWindowId(hint?: number): Promise<number | undefined> {
  if (hint !== undefined) return hint;

  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (activeTab?.windowId !== undefined) return activeTab.windowId;

  const lastFocused = await chrome.windows.getLastFocused({ windowTypes: ["normal"] });
  if (lastFocused.id !== undefined) return lastFocused.id;

  const anyFocused = await chrome.windows.getLastFocused();
  return anyFocused.id;
}

async function tryNativeSidePanelOpen(windowId: number): Promise<boolean> {
  if (!isNativeSidePanelApiComplete()) return false;

  try {
    await chrome.sidePanel.open({ windowId });
    return true;
  } catch (e) {
    log.debug("sidePanel.open(windowId) failed", e);
  }

  const [tab] = await chrome.tabs.query({ active: true, windowId });
  if (tab?.id !== undefined) {
    try {
      await chrome.sidePanel.open({ tabId: tab.id });
      return true;
    } catch (e) {
      log.debug("sidePanel.open(tabId) failed", e);
    }
  }

  return false;
}

async function verifyNativeSidePanelOpened(): Promise<boolean> {
  if (typeof chrome.runtime.getContexts !== "function") return true;

  await delay(SIDE_PANEL_PROBE_DELAY_MS);
  const contexts = await chrome.runtime.getContexts({
    contextTypes: [SIDE_PANEL_CONTEXT_TYPE],
  });
  return contexts.length > 0;
}

function scheduleNativeOpenVerification(): void {
  void verifyNativeSidePanelOpened().then((opened) => {
    if (opened || popupFallbackMode) return;
    log.info("sidePanel.open reported success but panel did not open — tab fallback");
    enablePopupFallbackMode();
    openPanelTabFromUserGesture();
  });
}

function openNativeSidePanelFromUserGesture(windowIdHint?: number): void {
  if (windowIdHint !== undefined) {
    chrome.sidePanel
      .open({ windowId: windowIdHint })
      .then(() => {
        scheduleNativeOpenVerification();
      })
      .catch((e: unknown) => {
        log.debug("sidePanel.open from gesture failed", e);
        enablePopupFallbackMode();
        openPanelTabFromUserGesture();
      });
    return;
  }

  chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (win) => {
    if (win.id === undefined) {
      enablePopupFallbackMode();
      openPanelTabFromUserGesture();
      return;
    }
    chrome.sidePanel
      .open({ windowId: win.id })
      .then(() => {
        scheduleNativeOpenVerification();
      })
      .catch((e: unknown) => {
        log.debug("sidePanel.open from gesture failed", e);
        enablePopupFallbackMode();
        openPanelTabFromUserGesture();
      });
  });
}

/**
 * Entry point for toolbar click and keyboard shortcut — must preserve user gesture.
 */
export function openSidePanelFromUserGesture(windowIdHint?: number): void {
  if (shouldUsePopupFallback()) {
    openPanelTabFromUserGesture();
    return;
  }
  openNativeSidePanelFromUserGesture(windowIdHint);
}

/**
 * Opens the panel (async). Prefer {@link openSidePanelFromUserGesture} for clicks/shortcuts.
 */
export async function openSidePanel(windowIdHint?: number): Promise<void> {
  await hydratePopupFallbackMode();

  if (popupFallbackMode) {
    openPanelTabFromUserGesture();
    return;
  }

  const windowId = await resolveTargetWindowId(windowIdHint);
  if (windowId !== undefined && (await tryNativeSidePanelOpen(windowId))) {
    return;
  }

  enablePopupFallbackMode();
  log.info("Using tab fallback for panel (native sidePanel unavailable)");
  openPanelTabFromUserGesture();
}

export function initSidePanelMode(): void {
  if (!isNativeSidePanelApiComplete()) {
    popupFallbackMode = true;
    log.info("Native sidePanel API incomplete — tab fallback enabled");
  }

  chrome.storage.session.get(
    [SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK, SESSION_KEY_SIDE_PANEL_FALLBACK_TAB],
    (result) => {
      const preferFallback = result[SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK] as boolean | undefined;
      if (preferFallback === false) {
        popupFallbackMode = false;
      } else {
        popupFallbackMode = true;
      }

      const tabId = result[SESSION_KEY_SIDE_PANEL_FALLBACK_TAB] as number | undefined;
      if (tabId !== undefined) {
        panelTabId = tabId;
      }
    },
  );

  void chrome.tabs.query({ url: panelUrl() }, (tabs) => {
    const existing = tabs.find((tab) => tab.id !== undefined);
    if (existing?.id !== undefined) {
      panelTabId = existing.id;
    }
  });

  void probeNativeSidePanelSupport();
}

export function initSidePanelWindowTracking(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (panelTabId === tabId) {
      clearRememberedPanelTab();
    }
  });

  chrome.windows.onCreated.addListener((window) => {
    if (window.id === undefined || window.type !== "normal") return;
    if (!isNativeSidePanelApiComplete()) return;
    chrome.sidePanel
      .setOptions({
        path: PANEL_PATH,
        enabled: true,
      })
      .catch((e: unknown) => log.debug("sidePanel.setOptions on window create failed", e));
  });
}

export function enableSidePanelOnExistingWindows(): void {
  if (!isNativeSidePanelApiComplete()) return;
  chrome.sidePanel
    .setOptions({
      path: PANEL_PATH,
      enabled: true,
    })
    .catch((e: unknown) => log.debug("sidePanel.setOptions failed", e));
}
