/**
 * Assembles the full AppState payload the panel renders from.
 *
 * Tab records in session storage are kept fresh by Chrome event listeners.
 * Full chrome.tabs.query reconciliation runs only when records are missing,
 * stale, or explicitly forced — not on every panel open.
 */
import type { AppState, ManagedTabRecord, StateCounts, TabView, WindowView } from "../shared/types.ts";
import { deriveDisplayState, computeInactiveMs } from "../shared/eligibility.ts";
import { computeSkipReason } from "../shared/lifecycle.ts";
import { isAutomationActive } from "../shared/defaults.ts";
import { loadSettings } from "./settings-service.ts";
import { loadRuntimeState } from "./runtime-state-service.ts";
import { getRecords, reconcileFromBrowser } from "./tab-repository.ts";
import {
  getCachedAppState,
  invalidateAppStateCache,
  setCachedAppState,
} from "./app-state-cache.ts";
import {
  getSession,
  setSession,
  SESSION_KEY_LAST_RECONCILE_AT,
  SESSION_KEY_PANEL_APP_STATE,
} from "./storage.ts";

/** Skip chrome.tabs.query when session records were reconciled recently. */
const RECONCILE_STALE_MS = 5 * 60 * 1000;

/** SW memory snapshot — instant panel reopen while the worker stays alive. */
const SW_SNAPSHOT_MAX_AGE_MS = 60_000;

async function loadTabRecords(now: number, forceReconcile = false): Promise<Map<number, ManagedTabRecord>> {
  const cached = await getRecords();
  if (!forceReconcile && cached.size > 0) {
    const lastReconcile = await getSession<number>(SESSION_KEY_LAST_RECONCILE_AT, 0);
    if (now - lastReconcile < RECONCILE_STALE_MS) {
      return cached;
    }
  }
  return reconcileFromBrowser(now);
}

async function buildAppStateFromRecords(
  records: Map<number, ManagedTabRecord>,
  now: number,
): Promise<AppState> {
  const [windows, settings, runtime] = await Promise.all([
    chrome.windows.getAll({ populate: true }).catch(() => chrome.windows.getAll()),
    loadSettings(),
    loadRuntimeState(),
  ]);

  const tabs: TabView[] = [];
  for (const record of records.values()) {
    if (record.removedAt !== undefined) continue;

    const displayState = deriveDisplayState(record, now);
    const inactiveMs = computeInactiveMs(record, now);

    const skipReason = computeSkipReason(record, settings, {
      now,
      browserStartedAt: runtime.browserStartedAt,
    });

    tabs.push({
      ...record,
      displayState,
      inactiveMs,
      skipReason,
    });
  }

  const focusedWindowId = windows.find((w) => w.focused)?.id;
  tabs.sort((a, b) => {
    if (a.windowId !== b.windowId) {
      if (a.windowId === focusedWindowId) return -1;
      if (b.windowId === focusedWindowId) return 1;
      return a.windowId - b.windowId;
    }
    return a.index - b.index;
  });

  const windowViews: WindowView[] = windows
    .filter((w) => w.id !== undefined)
    .map((win) => ({
      windowId: win.id!,
      focused: win.focused,
      type: win.type ?? "unknown",
      tabIds: tabs
        .filter((t) => t.windowId === win.id && t.removedAt === undefined)
        .map((t) => t.tabId),
    }));

  const knownWindowIds = new Set(windowViews.map((w) => w.windowId));
  const orphanWindowIds = [...new Set(tabs.map((t) => t.windowId))].filter(
    (id) => !knownWindowIds.has(id),
  );
  for (const windowId of orphanWindowIds) {
    windowViews.push({
      windowId,
      focused: false,
      type: "unknown",
      tabIds: tabs.filter((t) => t.windowId === windowId).map((t) => t.tabId),
    });
  }

  const counts: StateCounts = {
    total: 0,
    active: 0,
    background: 0,
    idle: 0,
    pendingClose: 0,
    unavailable: 0,
    locked: 0,
  };

  for (const tab of tabs) {
    counts.total++;
    switch (tab.displayState) {
      case "ACTIVE":
        counts.active++;
        break;
      case "BACKGROUND":
        counts.background++;
        break;
      case "IDLE":
        counts.idle++;
        break;
      case "PENDING_CLOSE":
        counts.pendingClose++;
        break;
      case "UNAVAILABLE":
        counts.unavailable++;
        break;
    }
    if (tab.closeLocked) counts.locked++;
  }

  const { version } = chrome.runtime.getManifest();

  return {
    extensionVersion: version,
    extensionId: chrome.runtime.id,
    settings,
    runtime,
    tabs,
    windows: windowViews,
    counts,
    automationActive: isAutomationActive(settings),
    now,
    inventory: {
      chromiumTabCount: tabs.length,
      browserWindowCount: windowViews.length,
    },
  };
}

async function persistPanelSnapshot(state: AppState): Promise<void> {
  try {
    await setSession({ [SESSION_KEY_PANEL_APP_STATE]: state });
  } catch {
    // Snapshot is optional — panel still works via messaging.
  }
}

export async function buildAppState(now: number, options?: { forceReconcile?: boolean }): Promise<AppState> {
  const records = await loadTabRecords(now, options?.forceReconcile ?? false);
  const state = await buildAppStateFromRecords(records, now);
  setCachedAppState(state);
  void persistPanelSnapshot(state);
  return state;
}

export interface GetAppStateOptions {
  /** Full chrome.tabs.query reconciliation before building. */
  force?: boolean;
  /** Return the SW memory snapshot when still fresh (panel reopen). */
  preferCachedSnapshot?: boolean;
}

/**
 * Panel read path — prefer cached snapshots and session tab records over
 * expensive reconciliation.
 */
export async function getAppState(options?: GetAppStateOptions): Promise<AppState> {
  const now = Date.now();

  if (options !== undefined && options.preferCachedSnapshot && !options.force) {
    const snapshot = getCachedAppState(SW_SNAPSHOT_MAX_AGE_MS);
    if (snapshot !== null) {
      return { ...snapshot, now };
    }

    const sessionSnapshot = await getSession<AppState | null>(SESSION_KEY_PANEL_APP_STATE, null);
    if (sessionSnapshot !== null) {
      return { ...sessionSnapshot, now };
    }
  }

  return buildAppState(now, { forceReconcile: options?.force ?? false });
}

export { invalidateAppStateCache };
