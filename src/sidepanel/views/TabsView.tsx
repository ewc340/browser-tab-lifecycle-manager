/**
 * Main tabs view: window-grouped list of all tabs.
 *
 * This is the only view that displays real data in Milestone 0. Virtualisation
 * is deferred to Milestone 1 (@tanstack/react-virtual is not yet installed).
 */
import type { AppState, StateCounts } from "../../shared/types.ts";
import { TabRow } from "../components/TabRow.tsx";
import { EmptyState } from "../components/EmptyState.tsx";

interface TabsViewProps {
  state: AppState;
  now: number;
  onActivateTab: (tabId: number) => void;
}

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
  const { tabs, windows, counts, extensionId } = state;

  if (tabs.length === 0) {
    return <EmptyState message="No tabs found." />;
  }

  const breakdown = buildBreakdown(counts);

  return (
    <div className="tabs-view">
      <header className="tabs-view__header" aria-live="polite" role="status">
        <span className="tabs-view__count">
          {counts.total} tab{counts.total !== 1 ? "s" : ""}
        </span>
        {breakdown.length > 0 && (
          <span className="tabs-view__breakdown">{breakdown}</span>
        )}
      </header>

      {windows.map((window, windowIndex) => {
        const windowTabs = tabs.filter((t) => window.tabIds.includes(t.tabId));
        if (windowTabs.length === 0) return null;

        // Chrome's window ids are large arbitrary integers, so they are numbered by
        // position for display instead of being shown raw.
        const label = window.focused ? "Current window" : `Window ${windowIndex + 1}`;

        return (
          <section
            key={window.windowId}
            className={`window-group${window.focused ? " window-group--focused" : ""}`}
            aria-label={`${label}, ${windowTabs.length} tabs`}
          >
            <h2 className="window-group__title">
              {label}
              <span className="window-group__count">
                {windowTabs.length} tab{windowTabs.length !== 1 ? "s" : ""}
              </span>
            </h2>
            <ul className="window-group__tabs">
              {windowTabs.map((tab) => (
                <TabRow
                  key={tab.tabId}
                  tab={tab}
                  now={now}
                  onActivate={onActivateTab}
                  extensionId={extensionId}
                />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
