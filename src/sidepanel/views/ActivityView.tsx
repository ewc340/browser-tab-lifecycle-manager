/**
 * Activity feed — filters, paging, and expandable aggregate rows (M3).
 */
import { useCallback, useEffect, useState } from "react";
import type { ActivityEvent } from "../../shared/types.ts";
import {
  filterActivityEvents,
  type ActivityFilter,
} from "../../shared/activity-filters.ts";
import { displayHostForTab } from "../../shared/sanitize.ts";
import { formatDate, formatTimeOfDay } from "../../shared/time.ts";
import { useMessaging } from "../hooks/useMessaging.ts";

const FILTERS: { id: ActivityFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "automatic", label: "Automatic" },
  { id: "manual", label: "Manual" },
  { id: "sleep", label: "Sleep" },
  { id: "close", label: "Close" },
  { id: "protection", label: "Protection" },
  { id: "warnings", label: "Warnings" },
  { id: "errors", label: "Errors" },
];

const PAGE_SIZE = 50;

function ActivityEventRow({
  event,
  extensionId,
  expanded,
  onToggle,
}: {
  event: ActivityEvent;
  extensionId?: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const totalCount =
    typeof event.metadata?.totalCount === "number" ? event.metadata.totalCount : event.tabs.length;
  const isAggregate = totalCount > event.tabs.length;

  return (
    <article className="activity-row">
      <div className="activity-row__header">
        <time className="activity-row__time" dateTime={new Date(event.occurredAt).toISOString()}>
          {formatDate(event.occurredAt)} {formatTimeOfDay(event.occurredAt)}
        </time>
        <span className="activity-row__source">{event.source.replaceAll("_", " ")}</span>
      </div>
      <p className="activity-row__message">{event.message}</p>
      {event.reason !== undefined && event.reason.length > 0 && (
        <p className="activity-row__reason">{event.reason}</p>
      )}
      {event.tabs.length > 0 && (
        <div className="activity-row__tabs">
          {isAggregate && (
            <button type="button" className="btn btn--ghost activity-row__expand" onClick={onToggle}>
              {expanded ? "Hide tabs" : `View ${totalCount} tab(s)`}
            </button>
          )}
          {(expanded || !isAggregate) &&
            event.tabs.map((tab, index) => (
              <div key={`${tab.url}-${index}`} className="activity-row__tab">
                <span className="activity-row__tab-title">{tab.title}</span>
                <span className="activity-row__tab-host">
                  {displayHostForTab(tab.url, extensionId)}
                </span>
              </div>
            ))}
        </div>
      )}
    </article>
  );
}

export function ActivityView() {
  const { send } = useMessaging();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [extensionId, setExtensionId] = useState<string | undefined>();

  const loadPage = useCallback(
    async (reset: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const page = await send({
          type: "GET_ACTIVITY",
          limit: PAGE_SIZE,
          ...(reset || nextCursor === undefined ? {} : { cursor: nextCursor }),
        });
        setEvents((prev) => (reset ? page.events : [...prev, ...page.events]));
        setNextCursor(page.nextCursor);
        if (extensionId === undefined) {
          const state = await send({ type: "GET_APP_STATE" });
          setExtensionId(state.extensionId);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load activity");
      } finally {
        setLoading(false);
      }
    },
    [extensionId, nextCursor, send],
  );

  useEffect(() => {
    void loadPage(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only
  }, []);

  const visible = filterActivityEvents(events, filter);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const downloadJson = async () => {
    const { json } = await send({ type: "EXPORT_DATA", includeRecovery: false });
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "tab-lifecycle-activity.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="activity-view">
      <div className="activity-view__toolbar">
        <div className="activity-view__filters" role="tablist" aria-label="Activity filters">
          {FILTERS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={`activity-view__filter${filter === id ? " activity-view__filter--active" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn--ghost" onClick={() => void downloadJson()}>
          Download JSON
        </button>
      </div>

      {error !== null && (
        <p className="activity-view__error" role="alert">
          {error}
        </p>
      )}

      {loading && events.length === 0 ? (
        <p className="activity-view__empty">Loading activity…</p>
      ) : visible.length === 0 ? (
        <p className="activity-view__empty">No activity yet for this filter.</p>
      ) : (
        <div className="activity-view__list">
          {visible.map((event) => (
            <ActivityEventRow
              key={event.id}
              event={event}
              {...(extensionId !== undefined ? { extensionId } : {})}
              expanded={expandedIds.has(event.id)}
              onToggle={() => toggleExpanded(event.id)}
            />
          ))}
        </div>
      )}

      {nextCursor !== undefined && (
        <button
          type="button"
          className="btn btn--ghost activity-view__more"
          disabled={loading}
          onClick={() => void loadPage(false)}
        >
          {loading ? "Loading…" : "Load more"}
        </button>
      )}
    </div>
  );
}
