/**
 * Pure filter and sort helpers for the panel tab list.
 *
 * Kept in shared/ so they are unit-testable without a browser and so the panel
 * never re-implements eligibility rules that belong in eligibility.ts.
 */
import type { LifecycleDisplayState, TabView } from "./types.ts";
import { displayHostForTab } from "./sanitize.ts";

export type StateFilter =
  | "all"
  | "active"
  | "background"
  | "idle"
  | "locked"
  | "pending"
  | "unavailable";

export type SortOption =
  | "recent"
  | "oldest"
  | "title"
  | "domain"
  | "window"
  | "pending";

export interface TabListQuery {
  search: string;
  stateFilter: StateFilter;
  windowFilter: number | "all";
  sort: SortOption;
}

const STATE_FILTER_MAP: Record<Exclude<StateFilter, "all" | "locked">, LifecycleDisplayState> = {
  active: "ACTIVE",
  background: "BACKGROUND",
  idle: "IDLE",
  pending: "PENDING_CLOSE",
  unavailable: "UNAVAILABLE",
};

export function matchesSearch(tab: TabView, query: string, extensionId?: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return true;

  const host = displayHostForTab(tab.url, extensionId).toLowerCase();
  return (
    tab.title.toLowerCase().includes(needle) ||
    host.includes(needle) ||
    tab.url.toLowerCase().includes(needle)
  );
}

export function matchesStateFilter(tab: TabView, filter: StateFilter): boolean {
  if (filter === "all") return true;
  if (filter === "locked") return tab.closeLocked;
  return tab.displayState === STATE_FILTER_MAP[filter];
}

export function matchesWindowFilter(tab: TabView, windowFilter: number | "all"): boolean {
  if (windowFilter === "all") return true;
  return tab.windowId === windowFilter;
}

export function filterTabs(
  tabs: readonly TabView[],
  query: TabListQuery,
  extensionId?: string,
): TabView[] {
  return tabs.filter(
    (tab) =>
      matchesSearch(tab, query.search, extensionId) &&
      matchesStateFilter(tab, query.stateFilter) &&
      matchesWindowFilter(tab, query.windowFilter),
  );
}

function comparePending(a: TabView, b: TabView): number {
  const aPending = a.pendingCloseAt ?? Number.MAX_SAFE_INTEGER;
  const bPending = b.pendingCloseAt ?? Number.MAX_SAFE_INTEGER;
  return aPending - bPending;
}

export function sortTabs(tabs: TabView[], sort: SortOption, focusedWindowId?: number): TabView[] {
  const copy = [...tabs];

  copy.sort((a, b) => {
    switch (sort) {
      case "recent":
        return b.lastActivatedAt - a.lastActivatedAt;
      case "oldest":
        return a.lastActivatedAt - b.lastActivatedAt;
      case "title":
        return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      case "domain": {
        const hostA = displayHostForTab(a.url).toLowerCase();
        const hostB = displayHostForTab(b.url).toLowerCase();
        const byHost = hostA.localeCompare(hostB, undefined, { sensitivity: "base" });
        return byHost !== 0 ? byHost : a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
      }
      case "window": {
        if (a.windowId !== b.windowId) {
          if (a.windowId === focusedWindowId) return -1;
          if (b.windowId === focusedWindowId) return 1;
          return a.windowId - b.windowId;
        }
        return a.index - b.index;
      }
      case "pending":
        return comparePending(a, b) || b.lastActivatedAt - a.lastActivatedAt;
      default:
        return 0;
    }
  });

  return copy;
}

export function applyTabListQuery(
  tabs: readonly TabView[],
  query: TabListQuery,
  extensionId?: string,
  focusedWindowId?: number,
): TabView[] {
  return sortTabs(filterTabs(tabs, query, extensionId), query.sort, focusedWindowId);
}
