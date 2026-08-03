/**
 * Debug view for Milestone 5 — clustered visit threads (last 7 days by default).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ThreadRecord, VisitRecord } from "../../shared/thread-types.ts";
import { displayHostForTab } from "../../shared/sanitize.ts";
import { formatDate, formatShortDuration } from "../../shared/time.ts";
import { STRINGS } from "../../shared/strings.ts";
import { useTick } from "../hooks/useAppState.ts";
import { useMessaging } from "../hooks/useMessaging.ts";

const DEFAULT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function VisitListItem({
  visit,
  extensionId,
  badge,
}: {
  visit: VisitRecord;
  extensionId?: string;
  badge?: string;
}) {
  return (
    <li className="thread-visit">
      <span className="thread-visit__title">{visit.title}</span>
      <span className="thread-visit__host">{displayHostForTab(visit.url, extensionId)}</span>
      <span className="thread-visit__meta">
        {badge !== undefined && <span className="thread-visit__badge">{badge}</span>}
        {formatDate(visit.startedAt)} · dwell {formatShortDuration(visit.totalDwellMs)}
        {visit.closeReason !== undefined && ` · ${visit.closeReason}`}
      </span>
    </li>
  );
}

export function ThreadsView() {
  const { send } = useMessaging();
  const now = useTick(30_000);
  const [threads, setThreads] = useState<ThreadRecord[]>([]);
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [activeVisits, setActiveVisits] = useState<VisitRecord[]>([]);
  const [orphanCount, setOrphanCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [extensionId, setExtensionId] = useState<string | undefined>();

  const fetchThreads = useCallback(
    async (refreshCapture: boolean) => {
      setError(null);
      const sinceMs = Date.now() - DEFAULT_WINDOW_MS;
      const [snapshot, state] = await Promise.all([
        send({ type: "GET_THREADS", sinceMs, refreshCapture }),
        send({ type: "GET_APP_STATE", preferCache: true }),
      ]);
      setThreads(snapshot.threads);
      setVisits(snapshot.visits);
      setActiveVisits(snapshot.activeVisits);
      setOrphanCount(snapshot.orphanVisitCount);
      setExtensionId(state.extensionId);
    },
    [send],
  );

  /* eslint-disable react-hooks/set-state-in-effect -- async mount fetch like Recovery */
  useEffect(() => {
    void fetchThreads(true)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load threads");
      })
      .finally(() => setLoading(false));
  }, [fetchThreads]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const refresh = () => {
    setLoading(true);
    void fetchThreads(true)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load threads");
      })
      .finally(() => setLoading(false));
  };

  const visitsByThread = useMemo(() => {
    const map = new Map<string, VisitRecord[]>();
    for (const visit of visits) {
      if (visit.threadId === undefined) continue;
      const list = map.get(visit.threadId) ?? [];
      list.push(visit);
      map.set(visit.threadId, list);
    }
    return map;
  }, [visits]);

  const hasThreadContent = threads.length > 0 || activeVisits.length > 0;

  return (
    <div className="threads-view">
      <p className="threads-view__hint">{STRINGS.threadsView.hint}</p>

      {error !== null && (
        <p className="threads-view__error" role="alert">
          {error}
        </p>
      )}

      {loading && !hasThreadContent ? (
        <p className="threads-view__empty">{STRINGS.threadsView.loading}</p>
      ) : !hasThreadContent ? (
        <p className="threads-view__empty">{STRINGS.threadsView.empty}</p>
      ) : (
        <>
          {activeVisits.length > 0 && (
            <section className="threads-view__open" aria-label="Open tab visits">
              <h2 className="threads-view__open-heading">
                {STRINGS.threadsView.openTabsHeading(activeVisits.length)}
              </h2>
              <ul className="thread-card__visits">
                {activeVisits.map((visit) => (
                  <VisitListItem
                    key={visit.visitId}
                    visit={visit}
                    {...(extensionId !== undefined ? { extensionId } : {})}
                    badge={STRINGS.threadsView.openTabBadge}
                  />
                ))}
              </ul>
            </section>
          )}

          {threads.length > 0 && (
            <ul className="threads-view__list">
              {threads.map((thread) => {
                const threadVisits = visitsByThread.get(thread.threadId) ?? [];
                const expanded = expandedId === thread.threadId;
                return (
                  <li key={thread.threadId} className="thread-card">
                    <button
                      type="button"
                      className="thread-card__header"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedId(expanded ? null : thread.threadId)
                      }
                    >
                      <span className="thread-card__label">{thread.label}</span>
                      <span className="thread-card__meta">
                        {thread.clusterKind === "session" && (
                          <span className="thread-card__kind">session burst</span>
                        )}
                        {thread.seedKey !== undefined && thread.clusterKind !== "session" && (
                          <span className="thread-card__seed">{thread.seedKey}</span>
                        )}
                        <span>
                          {formatShortDuration(now - thread.lastSeenAt)} ago
                        </span>
                      </span>
                    </button>
                    {expanded && (
                      <div className="thread-card__body">
                        <p className="thread-card__stats">
                          {thread.visitCount} visits ·{" "}
                          {formatShortDuration(thread.totalDwellMs)} total dwell ·{" "}
                          {thread.hosts.join(", ")}
                        </p>
                        <ul className="thread-card__visits">
                          {threadVisits.map((visit) => (
                            <VisitListItem
                              key={visit.visitId}
                              visit={visit}
                              {...(extensionId !== undefined ? { extensionId } : {})}
                            />
                          ))}
                        </ul>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      {!loading && orphanCount > 0 && (
        <p className="threads-view__orphans">
          {STRINGS.threadsView.orphans(orphanCount)}
        </p>
      )}

      <button type="button" className="btn btn--ghost threads-view__refresh" onClick={refresh}>
        {STRINGS.threadsView.refresh}
      </button>
    </div>
  );
}
