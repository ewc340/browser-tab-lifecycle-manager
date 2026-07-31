/**
 * Assembles the full AppState payload the panel renders from.
 *
 * Always reconciles from Chrome first so the panel gets a consistent snapshot
 * regardless of how stale the stored records are.
 */
import type { AppState, StateCounts, TabView, WindowView } from "../shared/types.ts";
import { deriveDisplayState, computeInactiveMs } from "../shared/eligibility.ts";
import { computeSkipReason } from "../shared/lifecycle.ts";
import { isAutomationActive } from "../shared/defaults.ts";
import { loadSettings } from "./settings-service.ts";
import { loadRuntimeState } from "./runtime-state-service.ts";
import { reconcileFromBrowser } from "./tab-repository.ts";

export async function buildAppState(now: number): Promise<AppState> {
  const [records, windows, settings, runtime] = await Promise.all([
    reconcileFromBrowser(now),
    chrome.windows.getAll(),
    loadSettings(),
    loadRuntimeState(),
  ]);

  // ── Build tab views ─────────────────────────────────────────────────────────
  const tabs: TabView[] = [];
  for (const record of records.values()) {
    // Skip tombstones — they represent tabs that have already been removed.
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

  // Sort: focused window first, then by window id, then by tab index within window.
  const focusedWindowId = windows.find((w) => w.focused)?.id;
  tabs.sort((a, b) => {
    if (a.windowId !== b.windowId) {
      if (a.windowId === focusedWindowId) return -1;
      if (b.windowId === focusedWindowId) return 1;
      return a.windowId - b.windowId;
    }
    return a.index - b.index;
  });

  // ── Build window views ──────────────────────────────────────────────────────
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

  // ── Counts ──────────────────────────────────────────────────────────────────
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
  };
}
