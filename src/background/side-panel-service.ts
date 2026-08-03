/**
 * Opens the lifecycle manager UI in the native side panel when available,
 * otherwise in a sidebar-style popup window (Arc and other forks without sidePanel).
 */
import * as log from "../shared/log.ts";
import { recordPanelOpenEvent } from "./panel-open-debug.ts";
import { broadcast } from "./messaging.ts";
import { taskQueue } from "./task-queue.ts";
import { reconcileFromBrowser } from "./tab-repository.ts";
import { getSession, setSession } from "./storage.ts";

export const SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW = "sidePanelFallbackWindowId";
export const SESSION_KEY_SIDE_PANEL_FALLBACK_TAB = "sidePanelFallbackTabId";
export const SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK = "sidePanelPreferFallback";
export const SESSION_KEY_NATIVE_SIDE_PANEL_PROVEN = "nativeSidePanelProven";

const PANEL_PATH = "sidepanel.html";
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 760;

const SIDE_PANEL_CONTEXT_TYPE = "SIDE_PANEL" as chrome.runtime.ContextType;
const SIDE_PANEL_PROBE_DELAY_MS = 300;

/** Use popup/tab fallback until native side panel is proven with a real SIDE_PANEL context. */
let popupFallbackMode = true;
/** In-memory popup window id — never read session before windows.create (gesture token). */
let panelPopupWindowId: number | undefined;
/** Tab fallback only when popup window creation fails. */
let panelTabId: number | undefined;

function panelUrl(): string {
  return chrome.runtime.getURL(PANEL_PATH);
}

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
  void setSession({
    [SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK]: true,
    [SESSION_KEY_NATIVE_SIDE_PANEL_PROVEN]: false,
  });
}

function markNativeSidePanelVerified(): void {
  popupFallbackMode = false;
  void setSession({
    [SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK]: false,
    [SESSION_KEY_NATIVE_SIDE_PANEL_PROVEN]: true,
  });
}

function rememberPanelPopup(windowId: number): void {
  panelPopupWindowId = windowId;
  void setSession({ [SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW]: windowId });
}

function clearRememberedPanelPopup(): void {
  panelPopupWindowId = undefined;
  void chrome.storage.session.remove(SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW);
}

function rememberPanelTab(tabId: number): void {
  panelTabId = tabId;
  void setSession({ [SESSION_KEY_SIDE_PANEL_FALLBACK_TAB]: tabId });
}

function clearRememberedPanelTab(): void {
  panelTabId = undefined;
  void chrome.storage.session.remove(SESSION_KEY_SIDE_PANEL_FALLBACK_TAB);
}

function scheduleReconcileForPanel(): void {
  taskQueue
    .push(async () => {
      await reconcileFromBrowser(Date.now());
      broadcast({ type: "APP_STATE_CHANGED" });
    })
    .catch((e: unknown) => log.error("panel open reconcile failed", e));
}

function positionPopupBesideBrowser(popupWindowId: number): void {
  chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (browserWin) => {
    if (chrome.runtime.lastError || browserWin.id === undefined) return;
    if (browserWin.id === popupWindowId) return;

    const width = browserWin.width ?? POPUP_WIDTH;
    const height = browserWin.height ?? POPUP_HEIGHT;
    const left = (browserWin.left ?? 0) + Math.max(0, width - POPUP_WIDTH);
    const top = browserWin.top ?? 0;

    void chrome.windows.update(popupWindowId, {
      left,
      top,
      height,
      width: POPUP_WIDTH,
    });
  });
}

function createPanelPopupWindow(): void {
  chrome.windows.create(
    {
      url: panelUrl(),
      type: "popup",
      width: POPUP_WIDTH,
      height: POPUP_HEIGHT,
      focused: true,
    },
    (popup) => {
      if (chrome.runtime.lastError) {
        recordPanelOpenEvent(
          "popup_create",
          "failed",
          chrome.runtime.lastError.message ?? "unknown",
        );
        openPanelTabFromUserGesture();
        return;
      }
      if (popup === undefined || popup.id === undefined) {
        recordPanelOpenEvent("popup_create", "failed", "no window returned");
        openPanelTabFromUserGesture();
        return;
      }
      recordPanelOpenEvent("popup_create", `ok windowId=${popup.id}`);
      rememberPanelPopup(popup.id);
      positionPopupBesideBrowser(popup.id);
    },
  );
}

/**
 * Sidebar-style popup window. Uses in-memory window id so create runs on the gesture chain.
 */
function openPanelPopupFromUserGesture(): void {
  recordPanelOpenEvent(
    "open_popup",
    `popupFallbackMode=${popupFallbackMode} panelPopupWindowId=${panelPopupWindowId ?? "none"}`,
  );

  if (panelPopupWindowId !== undefined) {
    chrome.windows.get(panelPopupWindowId, (existing) => {
      if (chrome.runtime.lastError || existing.id === undefined) {
        recordPanelOpenEvent("open_popup", "cached window missing", chrome.runtime.lastError?.message);
        clearRememberedPanelPopup();
        createPanelPopupWindow();
        return;
      }
      void chrome.windows.update(existing.id, { focused: true });
      recordPanelOpenEvent("open_popup", `focused existing windowId=${existing.id}`);
    });
    return;
  }

  createPanelPopupWindow();
}

function openPanelTabFromUserGesture(): void {
  const url = panelUrl();
  recordPanelOpenEvent("open_tab", `panelTabId=${panelTabId ?? "none"}`);

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
      recordPanelOpenEvent("tabs_create", "failed", chrome.runtime.lastError.message);
      log.error("tabs.create for panel failed", chrome.runtime.lastError.message);
      return;
    }
    if (created.id !== undefined) rememberPanelTab(created.id);
  });
}

function openPanelFallbackFromUserGesture(): void {
  openPanelPopupFromUserGesture();
}

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
      log.info("sidePanel.open returned but no SIDE_PANEL context — popup fallback");
      enablePopupFallbackMode();
      return;
    }

    markNativeSidePanelVerified();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/user gesture/i.test(msg)) {
      // API exists (Chrome) but needs a gesture — do not treat as proven; Arc stubs
      // can throw the same error. Keep popup fallback until a real SIDE_PANEL opens.
      recordPanelOpenEvent("probe", "native needs user gesture — not proven yet");
      return;
    }
    log.info("sidePanel probe failed — popup fallback", msg);
    enablePopupFallbackMode();
  }
}

async function hydratePopupFallbackMode(): Promise<void> {
  if (!isNativeSidePanelApiComplete()) {
    popupFallbackMode = true;
    return;
  }

  const preferFallback = await getSession<boolean>(SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK, true);
  const proven = await getSession<boolean>(SESSION_KEY_NATIVE_SIDE_PANEL_PROVEN, false);
  popupFallbackMode = preferFallback || !proven;
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
    if (opened) {
      markNativeSidePanelVerified();
      return;
    }
    if (popupFallbackMode) return;
    log.info("sidePanel.open reported success but panel did not open — popup fallback");
    enablePopupFallbackMode();
    openPanelFallbackFromUserGesture();
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
        openPanelFallbackFromUserGesture();
      });
    return;
  }

  chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (win) => {
    if (win.id === undefined) {
      enablePopupFallbackMode();
      openPanelFallbackFromUserGesture();
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
        openPanelFallbackFromUserGesture();
      });
  });
}

export function openSidePanelFromUserGesture(windowIdHint?: number): void {
  recordPanelOpenEvent(
    "open_gesture",
    `windowHint=${windowIdHint ?? "none"} fallback=${shouldUsePopupFallback()}`,
  );
  scheduleReconcileForPanel();
  if (shouldUsePopupFallback()) {
    openPanelFallbackFromUserGesture();
    return;
  }
  openNativeSidePanelFromUserGesture(windowIdHint);
}

export async function openSidePanel(windowIdHint?: number): Promise<void> {
  await hydratePopupFallbackMode();

  if (popupFallbackMode) {
    openPanelFallbackFromUserGesture();
    return;
  }

  const windowId = await resolveTargetWindowId(windowIdHint);
  if (windowId !== undefined && (await tryNativeSidePanelOpen(windowId))) {
    return;
  }

  enablePopupFallbackMode();
  log.info("Using popup fallback for panel (native sidePanel unavailable)");
  openPanelFallbackFromUserGesture();
}

export function initSidePanelMode(): void {
  if (!isNativeSidePanelApiComplete()) {
    popupFallbackMode = true;
    log.info("Native sidePanel API incomplete — popup fallback enabled");
  }

  chrome.storage.session.get(
    [
      SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK,
      SESSION_KEY_NATIVE_SIDE_PANEL_PROVEN,
      SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW,
      SESSION_KEY_SIDE_PANEL_FALLBACK_TAB,
    ],
    (result) => {
      const proven = result[SESSION_KEY_NATIVE_SIDE_PANEL_PROVEN] === true;
      const preferFallback = result[SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK] as boolean | undefined;

      if (proven && preferFallback === false) {
        popupFallbackMode = false;
      } else {
        popupFallbackMode = true;
      }

      const windowId = result[SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW] as number | undefined;
      if (windowId !== undefined) panelPopupWindowId = windowId;

      const tabId = result[SESSION_KEY_SIDE_PANEL_FALLBACK_TAB] as number | undefined;
      if (tabId !== undefined) panelTabId = tabId;
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
  chrome.windows.onRemoved.addListener((windowId) => {
    if (panelPopupWindowId === windowId) {
      clearRememberedPanelPopup();
    }
  });

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
