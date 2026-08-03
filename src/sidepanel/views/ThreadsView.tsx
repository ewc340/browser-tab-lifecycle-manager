/**
 * Debug view for Milestone 5 — clustered visit threads (last 7 days by default).
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ThreadRecord, VisitRecord } from "../../shared/thread-types.ts";
import { displayHostForTab } from "../../shared/sanitize.ts";
import { formatDate, formatShortDuration } from "../../shared/time.ts";
import { STRINGS } from "../../shared/strings.ts";
import { groupThreadsByHost, groupVisitsByHost } from "../../shared/visit-groups.ts";
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

function HostGroupSection({
  host,
  count,
  expanded,
  onToggle,
  children,
}: {
  host: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="threads-host-group">
      <button
        type="button"
        className="threads-host-group__header"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className="threads-host-group__host">{host}</span>
        <span className="threads-host-group__count">{count}</span>
      </button>
      {expanded && <div className="threads-host-group__body">{children}</div>}
    </section>
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
  const [expandedThreadId, setExpandedThreadId] = useState<string | null>(null);
  const [expandedHosts, setExpandedHosts] = useState<Set<string>>(() => new Set());
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

  const activeByHost = useMemo(() => groupVisitsByHost(activeVisits), [activeVisits]);
  const threadsByHost = useMemo(() => groupThreadsByHost(threads), [threads]);

  /* eslint-disable react-hooks/set-state-in-effect -- expand open host groups when data arrives */
  useEffect(() => {
    if (activeByHost.length === 0) return;
    setExpandedHosts((prev) => {
      const next = new Set(prev);
      for (const group of activeByHost) {
        next.add(`open:${group.host}`);
      }
      return next;
    });
  }, [activeByHost]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const hasThreadContent = threads.length > 0 || activeVisits.length > 0;

  const toggleHost = (key: string) => {
    setExpandedHosts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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
          {activeByHost.length > 0 && (
            <section className="threads-view__open" aria-label="Open tab visits">
              <h2 className="threads-view__open-heading">
                {STRINGS.threadsView.openTabsHeading(activeVisits.length)}
              </h2>
              {activeByHost.map((group) => {
                const hostKey = `open:${group.host}`;
                const expanded = expandedHosts.has(hostKey);
                return (
                  <HostGroupSection
                    key={hostKey}
                    host={group.host}
                    count={group.visits.length}
                    expanded={expanded}
                    onToggle={() => toggleHost(hostKey)}
                  >
                    <ul className="thread-card__visits">
                      {group.visits.map((visit) => (
                        <VisitListItem
                          key={visit.visitId}
                          visit={visit}
                          {...(extensionId !== undefined ? { extensionId } : {})}
                          badge={STRINGS.threadsView.openTabBadge}
                        />
                      ))}
                    </ul>
                  </HostGroupSection>
                );
              })}
            </section>
          )}

          {threadsByHost.length > 0 && (
            <section className="threads-view__ended" aria-label="Ended visit threads">
              <h2 className="threads-view__open-heading">{STRINGS.threadsView.endedHeading}</h2>
              {threadsByHost.map((group) => {
                const hostKey = `ended:${group.host}`;
                const expanded = expandedHosts.has(hostKey);
                return (
                  <HostGroupSection
                    key={hostKey}
                    host={group.host}
                    count={group.visitCount}
                    expanded={expanded}
                    onToggle={() => toggleHost(hostKey)}
                  >
                    <ul className="threads-view__list">
                      {group.threads.map((thread) => {
                        const threadVisits = visitsByThread.get(thread.threadId) ?? [];
                        const threadExpanded = expandedThreadId === thread.threadId;
                        return (
                          <li key={thread.threadId} className="thread-card">
                            <button
                              type="button"
                              className="thread-card__header"
                              aria-expanded={threadExpanded}
                              onClick={() =>
                                setExpandedThreadId(threadExpanded ? null : thread.threadId)
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
                            {threadExpanded && (
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
                  </HostGroupSection>
                );
              })}
            </section>
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
