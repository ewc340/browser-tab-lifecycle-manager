/**
 * Main tabs view: search, filters, sorting, bulk actions, and a virtualized list.
 */
import { useMemo, useState } from "react";
import type { AppState, StateCounts } from "../../shared/types.ts";
import {
  applyTabListQuery,
  type SortOption,
  type StateFilter,
  type TabListQuery,
} from "../../shared/tab-list.ts";
import { STRINGS } from "../../shared/strings.ts";
import { EmptyState } from "../components/EmptyState.tsx";
import { ConfirmDialog } from "../components/ConfirmDialog.tsx";
import { VirtualTabList, type TabListEntry } from "../components/VirtualTabList.tsx";
import { useMessaging } from "../hooks/useMessaging.ts";

interface TabsViewProps {
  state: AppState;
  now: number;
  onActivateTab: (tabId: number) => void;
}

type PendingBulk =
  | { kind: "close"; tabIds: number[] }
  | { kind: "unlock"; tabIds: number[] }
  | null;

const STATE_FILTERS: { value: StateFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "background", label: "Background" },
  { value: "idle", label: "Idle" },
  { value: "locked", label: "Locked" },
  { value: "pending", label: "Pending closure" },
  { value: "unavailable", label: "Unavailable" },
];

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "recent", label: "Recently active" },
  { value: "oldest", label: "Least recently active" },
  { value: "title", label: "Title" },
  { value: "domain", label: "Domain" },
  { value: "window", label: "Window" },
  { value: "pending", label: "Pending closure time" },
];

function buildBreakdown(counts: StateCounts): string {
  const parts: string[] = [
    counts.active > 0 ? `Active ${counts.active}` : "",
    counts.background > 0 ? `Background ${counts.background}` : "",
    counts.idle > 0 ? `Idle ${counts.idle}` : "",
    counts.pendingClose > 0 ? `Pending ${counts.pendingClose}` : "",
    counts.unavailable > 0 ? `Unavailable ${counts.unavailable}` : "",
    counts.locked > 0 ? `Locked ${counts.locked}` : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

export function TabsView({ state, now, onActivateTab }: TabsViewProps) {
  const { send } = useMessaging();
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("all");
  const [windowFilter, setWindowFilter] = useState<number | "all">("all");
  const [sort, setSort] = useState<SortOption>("recent");
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pendingBulk, setPendingBulk] = useState<PendingBulk>(null);

  const focusedWindowId = state.windows.find((window) => window.focused)?.windowId;

  const filteredTabs = useMemo(() => {
    const query: TabListQuery = { search, stateFilter, windowFilter, sort };
    return applyTabListQuery(state.tabs, query, state.extensionId, focusedWindowId);
  }, [state.tabs, search, stateFilter, windowFilter, sort, state.extensionId, focusedWindowId]);

  const entries = useMemo((): TabListEntry[] => {
    const items: TabListEntry[] = [];
    const windows =
      windowFilter === "all"
        ? state.windows
        : state.windows.filter((window) => window.windowId === windowFilter);

    for (const [windowIndex, window] of windows.entries()) {
      const windowTabs = filteredTabs.filter((tab) => tab.windowId === window.windowId);
      if (windowTabs.length === 0) continue;

      const label = window.focused ? "Current window" : `Window ${windowIndex + 1}`;
      items.push({
        kind: "window",
        key: `window-${window.windowId}`,
        label,
        count: windowTabs.length,
      });

      for (const tab of windowTabs) {
        items.push({ kind: "tab", key: `tab-${tab.tabId}`, tab });
      }
    }

    return items;
  }, [filteredTabs, state.windows, windowFilter]);

  const toggleSelect = (tabId: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(tabId)) next.delete(tabId);
      else next.add(tabId);
      return next;
    });
  };

  const selectedArray = [...selectedIds];

  const runBulk = async (action: () => Promise<unknown>) => {
    await action();
    setSelectedIds(new Set());
  };

  const bulkSleep = () => runBulk(() => send({ type: "SLEEP_TABS", tabIds: selectedArray }));
  const bulkLock = () => runBulk(() => send({ type: "LOCK_TABS", tabIds: selectedArray }));
  const bulkUnlock = () => {
    if (selectedArray.length > 10) {
      setPendingBulk({ kind: "unlock", tabIds: selectedArray });
      return;
    }
    void runBulk(() => send({ type: "UNLOCK_TABS", tabIds: selectedArray }));
  };
  const bulkClose = () => {
    if (selectedArray.length > 5) {
      setPendingBulk({ kind: "close", tabIds: selectedArray });
      return;
    }
    void runBulk(() => send({ type: "CLOSE_TABS", tabIds: selectedArray }));
  };

  const confirmPendingBulk = () => {
    if (pendingBulk === null) return;
    const tabIds = pendingBulk.tabIds;
    setPendingBulk(null);
    if (pendingBulk.kind === "close") {
      void runBulk(() => send({ type: "CLOSE_TABS", tabIds }));
    } else {
      void runBulk(() => send({ type: "UNLOCK_TABS", tabIds }));
    }
  };

  const breakdown = buildBreakdown(state.counts);

  return (
    <div className="tabs-view">
      <header className="tabs-view__header" aria-live="polite" role="status">
        <span className="tabs-view__count">
          {state.counts.total} tab{state.counts.total !== 1 ? "s" : ""}
        </span>
        {breakdown.length > 0 && <span className="tabs-view__breakdown">{breakdown}</span>}
      </header>

      <div className="tabs-toolbar">
        <label className="tabs-toolbar__search">
          <span className="sr-only">Search tabs</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search title, host, or URL"
          />
        </label>

        <div className="tabs-toolbar__filters">
          <label className="tabs-toolbar__field">
            <span className="tabs-toolbar__label">State</span>
            <select
              value={stateFilter}
              onChange={(event) => setStateFilter(event.target.value as StateFilter)}
            >
              {STATE_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="tabs-toolbar__field">
            <span className="tabs-toolbar__label">Window</span>
            <select
              value={windowFilter === "all" ? "all" : String(windowFilter)}
              onChange={(event) => {
                const value = event.target.value;
                setWindowFilter(value === "all" ? "all" : Number(value));
              }}
            >
              <option value="all">All windows</option>
              {state.windows.map((window, index) => (
                <option key={window.windowId} value={window.windowId}>
                  {window.focused ? "Current window" : `Window ${index + 1}`}
                </option>
              ))}
            </select>
          </label>

          <label className="tabs-toolbar__field">
            <span className="tabs-toolbar__label">Sort</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortOption)}
            >
              {SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={`btn btn--ghost${bulkMode ? " btn--ghost-active" : ""}`}
            aria-pressed={bulkMode}
            onClick={() => {
              setBulkMode((current) => !current);
              setSelectedIds(new Set());
            }}
          >
            Select
          </button>
        </div>
      </div>

      {bulkMode && selectedArray.length > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Bulk tab actions">
          <span className="bulk-bar__count">{selectedArray.length} selected</span>
          <button type="button" className="btn btn--ghost" onClick={() => void bulkSleep()}>
            {STRINGS.bulk.sleep}
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => void bulkLock()}>
            {STRINGS.bulk.lock}
          </button>
          <button type="button" className="btn btn--ghost" onClick={bulkUnlock}>
            {STRINGS.bulk.unlock}
          </button>
          <button type="button" className="btn btn--ghost" onClick={bulkClose}>
            {STRINGS.bulk.close}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            {STRINGS.bulk.clearSelection}
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState message="No tabs match your filters." />
      ) : (
        <VirtualTabList
          entries={entries}
          now={now}
          extensionId={state.extensionId}
          bulkMode={bulkMode}
          selectedIds={selectedIds}
          onActivate={onActivateTab}
          onToggleSelect={toggleSelect}
          onLock={(tabId) => void send({ type: "LOCK_TABS", tabIds: [tabId] })}
          onUnlock={(tabId) => void send({ type: "UNLOCK_TABS", tabIds: [tabId] })}
          onSleep={(tabId) => void send({ type: "SLEEP_TABS", tabIds: [tabId] })}
          onWake={(tabId) => void send({ type: "WAKE_TABS", tabIds: [tabId] })}
          onClose={(tabId) => void send({ type: "CLOSE_TABS", tabIds: [tabId] })}
          onKeepLoaded={(tabId, keepLoaded) =>
            void send({ type: "SET_KEEP_LOADED", tabIds: [tabId], keepLoaded })
          }
          onSnooze={(tabId) =>
            void send({
              type: "SNOOZE_TABS",
              tabIds: [tabId],
              untilMs: Date.now() + STRINGS.snooze.sevenDays,
            })
          }
          onNeverCloseSite={(tabId) => {
            const tab = state.tabs.find((entry) => entry.tabId === tabId);
            if (tab === undefined || tab.url.length === 0) return;
            try {
              const host = new URL(tab.url).hostname.toLowerCase();
              if (host.length === 0) return;
              void send({ type: "SET_HOST_RULE", host, rule: "NEVER_CLOSE" });
            } catch {
              // Non-standard URLs (e.g. chrome://) cannot become host rules.
            }
          }}
        />
      )}

      <ConfirmDialog
        open={pendingBulk?.kind === "close"}
        title={STRINGS.close.confirmTitle}
        body={STRINGS.close.confirmBody(pendingBulk?.tabIds.length ?? 0)}
        confirmLabel={STRINGS.close.bulkAction}
        onConfirm={confirmPendingBulk}
        onCancel={() => setPendingBulk(null)}
      />

      <ConfirmDialog
        open={pendingBulk?.kind === "unlock"}
        title={STRINGS.bulk.unlockConfirmTitle}
        body={STRINGS.bulk.unlockConfirmBody(pendingBulk?.tabIds.length ?? 0)}
        confirmLabel={STRINGS.bulk.unlock}
        onConfirm={confirmPendingBulk}
        onCancel={() => setPendingBulk(null)}
      />
    </div>
  );
}
