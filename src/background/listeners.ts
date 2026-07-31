/**
 * Thin adapters from Chrome tab/window events to repository mutations.
 *
 * Each handler updates the relevant record(s) in session storage then schedules
 * a debounced APP_STATE_CHANGED broadcast. The debounce (~150 ms) coalesces
 * rapid sequences (e.g. opening a new tab triggers onCreated + onActivated +
 * onUpdated) into a single panel refresh without waking the service worker
 * unnecessarily. Losing a broadcast to worker termination is harmless because
 * the panel also refreshes on visibilitychange and on a 60 s timer.
 */
import * as log from "../shared/log.ts";
import { taskQueue } from "./task-queue.ts";
import { broadcast } from "./messaging.ts";
import {
  getRecords,
  markRemoved,
  putRecord,
  putRecords,
  reconcileFromBrowser,
  recordFromTab,
} from "./tab-repository.ts";

// ── Debounced broadcast ───────────────────────────────────────────────────────

let broadcastTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleBroadcast(): void {
  if (broadcastTimer !== undefined) clearTimeout(broadcastTimer);
  broadcastTimer = setTimeout(() => {
    broadcastTimer = undefined;
    broadcast({ type: "APP_STATE_CHANGED" });
  }, 150);
}

// ── Window type cache ─────────────────────────────────────────────────────────
// onUpdated fires many times per page load (status, title, favicon), so calling
// chrome.windows.get() on every event is wasteful. A short-lived cache (~5 s)
// cuts those round-trips while keeping the value fresh enough for correctness.

type WindowTypeValue = NonNullable<chrome.windows.Window["type"]> | "unknown";

const windowTypeCache = new Map<number, { type: WindowTypeValue; at: number }>();
const WINDOW_TYPE_TTL_MS = 5_000;

async function getWindowType(windowId: number): Promise<WindowTypeValue> {
  const now = Date.now();
  const cached = windowTypeCache.get(windowId);
  if (cached !== undefined && now - cached.at < WINDOW_TYPE_TTL_MS) {
    return cached.type;
  }
  try {
    const win = await chrome.windows.get(windowId);
    const type: WindowTypeValue = win.type ?? "unknown";
    windowTypeCache.set(windowId, { type, at: now });
    return type;
  } catch {
    return "unknown";
  }
}

// ── Listener registration ─────────────────────────────────────────────────────

export function initListeners(): void {
  // ── Tab events ──────────────────────────────────────────────────────────────

  chrome.tabs.onCreated.addListener((tab) => {
    taskQueue
      .push(async () => {
        const now = Date.now();
        const windowType = await getWindowType(tab.windowId);
        const record = recordFromTab(tab, windowType, undefined, now);
        await putRecord(record);
        scheduleBroadcast();
      })
      .catch((e: unknown) => log.error("onCreated handler failed", e));
  });

  chrome.tabs.onUpdated.addListener((tabId, _changeInfo, tab) => {
    taskQueue
      .push(async () => {
        const now = Date.now();
        const records = await getRecords();
        const existing = records.get(tabId);
        const windowType = await getWindowType(tab.windowId);
        const record = recordFromTab(tab, windowType, existing, now);
        await putRecord(record);
        scheduleBroadcast();
      })
      .catch((e: unknown) => log.error("onUpdated handler failed", e));
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    taskQueue
      .push(async () => {
        const now = Date.now();
        const records = await getRecords();

        // Single read-modify-write: deactivate the previously active tab and
        // activate the new one in memory, then persist once. With many tabs,
        // this is one storage read + one write instead of N+1 writes.
        for (const record of records.values()) {
          if (record.windowId === activeInfo.windowId && record.tabId !== activeInfo.tabId) {
            if (record.active) {
              records.set(record.tabId, { ...record, active: false });
            }
          }
        }

        const activeRecord = records.get(activeInfo.tabId);
        if (activeRecord !== undefined) {
          records.set(activeInfo.tabId, {
            ...activeRecord,
            active: true,
            lastActivatedAt: now,
            neverActivated: false,
          });
        }

        await putRecords(records);
        scheduleBroadcast();
      })
      .catch((e: unknown) => log.error("onActivated handler failed", e));
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    taskQueue
      .push(async () => {
        const now = Date.now();
        await markRemoved(tabId, now);
        scheduleBroadcast();
      })
      .catch((e: unknown) => log.error("onRemoved handler failed", e));
  });

  chrome.tabs.onMoved.addListener((tabId, moveInfo) => {
    taskQueue
      .push(async () => {
        const records = await getRecords();
        const existing = records.get(tabId);
        if (existing !== undefined) {
          records.set(tabId, {
            ...existing,
            windowId: moveInfo.windowId,
            index: moveInfo.toIndex,
            lastUpdatedAt: Date.now(),
          });
          await putRecords(records);
        }
        scheduleBroadcast();
      })
      .catch((e: unknown) => log.error("onMoved handler failed", e));
  });

  chrome.tabs.onAttached.addListener((tabId, attachInfo) => {
    taskQueue
      .push(async () => {
        const records = await getRecords();
        const existing = records.get(tabId);
        if (existing !== undefined) {
          records.set(tabId, {
            ...existing,
            windowId: attachInfo.newWindowId,
            index: attachInfo.newPosition,
            lastUpdatedAt: Date.now(),
          });
          await putRecords(records);
        }
        scheduleBroadcast();
      })
      .catch((e: unknown) => log.error("onAttached handler failed", e));
  });

  chrome.tabs.onDetached.addListener((tabId) => {
    taskQueue
      .push(async () => {
        const records = await getRecords();
        const existing = records.get(tabId);
        if (existing !== undefined) {
          records.set(tabId, { ...existing, lastUpdatedAt: Date.now() });
          await putRecords(records);
        }
        scheduleBroadcast();
      })
      .catch((e: unknown) => log.error("onDetached handler failed", e));
  });

  chrome.tabs.onReplaced.addListener((_addedTabId, removedTabId) => {
    // The old tab id is gone; keep its tombstone so the next reconcile can
    // transfer accumulated state to the replacement (Milestone 2+).
    taskQueue
      .push(async () => {
        const now = Date.now();
        await markRemoved(removedTabId, now);
        // Trigger a full reconcile so the new tab gets its record.
        await reconcileFromBrowser(now);
        scheduleBroadcast();
      })
      .catch((e: unknown) => log.error("onReplaced handler failed", e));
  });

  // ── Window events ───────────────────────────────────────────────────────────

  chrome.windows.onCreated.addListener(() => {
    taskQueue
      .push(async () => {
        await reconcileFromBrowser(Date.now());
        scheduleBroadcast();
      })
      .catch((e: unknown) => log.error("windows.onCreated handler failed", e));
  });

  chrome.windows.onRemoved.addListener((windowId) => {
    // Evict the stale cache entry so the next lookup does a fresh API call.
    windowTypeCache.delete(windowId);

    // Tabs in this window will fire onRemoved individually; just re-reconcile.
    taskQueue
      .push(async () => {
        await reconcileFromBrowser(Date.now());
        scheduleBroadcast();
      })
      .catch((e: unknown) => log.error("windows.onRemoved handler failed", e));
  });

  chrome.windows.onFocusChanged.addListener((windowId) => {
    // chrome.tabs.onActivated does NOT fire when the user switches windows, so
    // without this handler a tab being read in another window would age toward
    // automatic closure despite being actively used.
    if (windowId === chrome.windows.WINDOW_ID_NONE) return;

    taskQueue
      .push(async () => {
        const now = Date.now();
        const tabs = await chrome.tabs.query({ windowId, active: true });
        const activeTab = tabs[0];
        if (activeTab?.id !== undefined) {
          const records = await getRecords();
          const existing = records.get(activeTab.id);
          if (existing !== undefined) {
            records.set(activeTab.id, {
              ...existing,
              lastActivatedAt: now,
              neverActivated: false,
              active: true,
            });
            await putRecords(records);
          }
          scheduleBroadcast();
        }
      })
      .catch((e: unknown) => log.error("windows.onFocusChanged handler failed", e));
  });
}
