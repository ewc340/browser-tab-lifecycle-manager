/**
 * Opens the lifecycle manager UI in the native side panel when available,
 * otherwise in a standalone popup window (Arc and other forks without sidePanel).
 */
import * as log from "../shared/log.ts";
import { getSession, setSession } from "./storage.ts";

export const SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW = "sidePanelFallbackWindowId";
export const SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK = "sidePanelPreferFallback";

const PANEL_PATH = "sidepanel.html";
const POPUP_WIDTH = 420;
const POPUP_HEIGHT = 760;

/** In-memory mode — avoids async session reads on the user-gesture path. */
let popupFallbackMode = false;

const SIDE_PANEL_CONTEXT_TYPE = "SIDE_PANEL" as chrome.runtime.ContextType;
const SIDE_PANEL_PROBE_DELAY_MS = 300;

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
      log.info("sidePanel.open returned but no SIDE_PANEL context — enabling popup fallback");
      enablePopupFallbackMode();
      return;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/user gesture/i.test(msg)) {
      return;
    }
    log.info("sidePanel probe failed — enabling popup fallback", msg);
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

function enablePopupFallbackMode(): void {
  popupFallbackMode = true;
  void setSession({ [SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK]: true });
}

/**
 * Opens or focuses the popup fallback. Uses callback-style Chrome APIs so the call
 * stays on the user-gesture chain (async/await before windows.create drops the token).
 */
function openFallbackPopupFromUserGesture(): void {
  chrome.storage.session.get(SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW, (result) => {
    const existingId = result[SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW] as number | undefined;

    if (existingId !== undefined) {
      chrome.windows.get(existingId, (existing) => {
        if (chrome.runtime.lastError || existing.id === undefined) {
          createFallbackPopupWindow();
          return;
        }
        void chrome.windows.update(existing.id, { focused: true });
      });
      return;
    }

    createFallbackPopupWindow();
  });
}

function createFallbackPopupWindow(): void {
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
        log.error("Failed to open fallback popup", chrome.runtime.lastError.message);
        return;
      }
      if (popup?.id !== undefined) {
        void chrome.storage.session.set({ [SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW]: popup.id });
      }
    },
  );
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
    log.info("sidePanel.open reported success but panel did not open — popup fallback");
    enablePopupFallbackMode();
    openFallbackPopupFromUserGesture();
  });
}

function openNativeSidePanelFromUserGesture(windowIdHint?: number): void {
  if (windowIdHint !== undefined) {
    chrome.sidePanel.open({ windowId: windowIdHint }).then(() => {
      scheduleNativeOpenVerification();
    }).catch((e: unknown) => {
      log.debug("sidePanel.open from gesture failed", e);
      enablePopupFallbackMode();
      openFallbackPopupFromUserGesture();
    });
    return;
  }

  chrome.windows.getLastFocused({ windowTypes: ["normal"] }, (win) => {
    if (win.id === undefined) {
      enablePopupFallbackMode();
      openFallbackPopupFromUserGesture();
      return;
    }
    chrome.sidePanel.open({ windowId: win.id }).then(() => {
      scheduleNativeOpenVerification();
    }).catch((e: unknown) => {
      log.debug("sidePanel.open from gesture failed", e);
      enablePopupFallbackMode();
      openFallbackPopupFromUserGesture();
    });
  });
}

/**
 * Entry point for toolbar click and keyboard shortcut — must preserve user gesture.
 */
export function openSidePanelFromUserGesture(windowIdHint?: number): void {
  if (shouldUsePopupFallback()) {
    openFallbackPopupFromUserGesture();
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
    openFallbackPopupFromUserGesture();
    return;
  }

  const windowId = await resolveTargetWindowId(windowIdHint);
  if (windowId !== undefined && (await tryNativeSidePanelOpen(windowId))) {
    return;
  }

  enablePopupFallbackMode();
  log.info("Using popup fallback for side panel (native sidePanel unavailable)");
  openFallbackPopupFromUserGesture();
}

function isArcBrowser(): boolean {
  return /Arc\/|ArcBrowser/i.test(navigator.userAgent);
}

export function initSidePanelMode(): void {
  if (!isNativeSidePanelApiComplete()) {
    popupFallbackMode = true;
    log.info("Native sidePanel API incomplete — popup fallback enabled");
  }

  chrome.storage.session.get(SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK, (result) => {
    if (result[SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK]) {
      popupFallbackMode = true;
    }
  });

  if (isArcBrowser()) {
    log.info("Arc browser detected — popup fallback enabled");
    enablePopupFallbackMode();
  }

  void probeNativeSidePanelSupport();
}

export function initSidePanelWindowTracking(): void {
  chrome.windows.onRemoved.addListener((windowId) => {
    void (async () => {
      const fallbackId = await getSession<number | undefined>(
        SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW,
        undefined,
      );
      if (fallbackId === windowId) {
        await chrome.storage.session.remove(SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW);
      }
    })();
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
