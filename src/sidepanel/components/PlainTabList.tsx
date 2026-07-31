/**
 * Plain (non-virtualized) tab list. Used for small tab counts and as a fallback
 * while the virtualized implementation loads.
 */
import { TabRow } from "./TabRow.tsx";
import type { TabListEntry } from "./virtual-tab-list-types.ts";

export interface TabListProps {
  entries: TabListEntry[];
  now: number;
  extensionId: string;
  bulkMode: boolean;
  selectedIds: ReadonlySet<number>;
  onActivate: (tabId: number) => void;
  onToggleSelect: (tabId: number) => void;
  onLock: (tabId: number) => void;
  onUnlock: (tabId: number) => void;
  onSleep: (tabId: number) => void;
  onWake: (tabId: number) => void;
  onClose: (tabId: number) => void;
  onKeepLoaded: (tabId: number, keepLoaded: boolean) => void;
  onSnooze: (tabId: number) => void;
  onNeverCloseSite: (tabId: number) => void;
}

export function PlainTabList({
  entries,
  now,
  extensionId,
  bulkMode,
  selectedIds,
  onActivate,
  onToggleSelect,
  onLock,
  onUnlock,
  onSleep,
  onWake,
  onClose,
  onKeepLoaded,
  onSnooze,
  onNeverCloseSite,
}: TabListProps) {
  return (
    <div className="virtual-tab-list" role="list">
      {entries.map((entry) =>
        entry.kind === "window" ? (
          <div key={entry.key} className="window-group__title virtual-tab-list__header">
            <span>{entry.label}</span>
            <span className="window-group__count">
              {entry.count} tab{entry.count !== 1 ? "s" : ""}
            </span>
          </div>
        ) : (
          <TabRow
            key={entry.key}
            tab={entry.tab}
            now={now}
            extensionId={extensionId}
            bulkMode={bulkMode}
            selected={selectedIds.has(entry.tab.tabId)}
            onActivate={onActivate}
            onToggleSelect={onToggleSelect}
            onLock={onLock}
            onUnlock={onUnlock}
            onSleep={onSleep}
            onWake={onWake}
            onClose={onClose}
            onKeepLoaded={onKeepLoaded}
            onSnooze={onSnooze}
            onNeverCloseSite={onNeverCloseSite}
          />
        ),
      )}
    </div>
  );
}
