/**
 * Thread clustering — entity keys (M5) and same-window session bursts (M5+).
 */
import type { ThreadRecord, VisitRecord } from "./thread-types.ts";
import { buildSessionThreadLabel, buildThreadAutoLabel } from "./thread-label.ts";
import { primaryEntityKey } from "./entity-keys.ts";
import { MINUTE } from "./time.ts";

/** Visits in the same window within this gap share a session thread. */
export const SESSION_CLUSTER_GAP_MS = 90 * MINUTE;

export function seedKeyForVisit(visit: VisitRecord): string | undefined {
  return primaryEntityKey(visit.entityKeys);
}

export function threadIdForSeed(seedKey: string): string {
  const safe = seedKey.replace(/[^a-zA-Z0-9:+._-]/g, "_").slice(0, 120);
  return `thread_${safe}`;
}

function sessionAutoLabel(thread: ThreadRecord): string {
  return buildSessionThreadLabel(thread.hosts, thread.visitCount, thread.lastSeenAt);
}

export function mergeVisitIntoThread(thread: ThreadRecord, visit: VisitRecord, now: number): ThreadRecord {
  const visitIds = thread.visitIds.includes(visit.visitId)
    ? thread.visitIds
    : [...thread.visitIds, visit.visitId];

  const entityKeys = [...new Set([...thread.entityKeys, ...visit.entityKeys])].sort();
  const hosts = [...new Set([...thread.hosts, visit.host])].sort();

  const visitCount = visitIds.length;
  const totalDwellMs = thread.totalDwellMs + visit.totalDwellMs;
  const firstSeenAt = Math.min(thread.firstSeenAt, visit.startedAt);
  const lastSeenAt = Math.max(thread.lastSeenAt, visit.lastSeenAt, visit.endedAt ?? visit.lastSeenAt);

  const autoLabel =
    thread.clusterKind === "session"
      ? sessionAutoLabel({
          ...thread,
          hosts,
          visitCount,
          lastSeenAt,
        })
      : buildThreadAutoLabel(thread.seedKey, entityKeys, visitCount, lastSeenAt);

  return {
    ...thread,
    entityKeys,
    hosts,
    visitIds,
    visitCount,
    totalDwellMs,
    firstSeenAt,
    lastSeenAt,
    updatedAt: now,
    autoLabel,
    label: thread.label === thread.autoLabel ? autoLabel : thread.label,
  };
}

export function createThreadFromVisit(visit: VisitRecord, now: number): ThreadRecord | undefined {
  const seedKey = seedKeyForVisit(visit);
  if (seedKey === undefined) return undefined;

  const threadId = threadIdForSeed(seedKey);
  const autoLabel = buildThreadAutoLabel(seedKey, visit.entityKeys, 1, visit.lastSeenAt);

  return {
    threadId,
    label: autoLabel,
    autoLabel,
    entityKeys: [...visit.entityKeys],
    hosts: [visit.host],
    visitIds: [visit.visitId],
    visitCount: 1,
    totalDwellMs: visit.totalDwellMs,
    firstSeenAt: visit.startedAt,
    lastSeenAt: visit.lastSeenAt,
    createdAt: now,
    updatedAt: now,
    seedKey,
    clusterKind: "entity",
  };
}

export function isSameSessionBurst(thread: ThreadRecord, visit: VisitRecord): boolean {
  if (thread.clusterKind !== "session") return false;
  if (thread.windowId !== visit.windowId) return false;
  return visit.startedAt <= thread.lastSeenAt + SESSION_CLUSTER_GAP_MS;
}

export function findSessionThreadForVisit(
  visit: VisitRecord,
  threads: Map<string, ThreadRecord>,
): ThreadRecord | undefined {
  let best: ThreadRecord | undefined;
  for (const thread of threads.values()) {
    if (!isSameSessionBurst(thread, visit)) continue;
    if (best === undefined || thread.lastSeenAt > best.lastSeenAt) {
      best = thread;
    }
  }
  return best;
}

export function createSessionThreadFromVisit(visit: VisitRecord, now: number): ThreadRecord {
  const seedKey = `session:w${visit.windowId}`;
  const threadId = threadIdForSeed(`${seedKey}:${visit.startedAt}`);
  const hosts = visit.host.length > 0 ? [visit.host] : [];
  const autoLabel = buildSessionThreadLabel(hosts, 1, visit.lastSeenAt);

  return {
    threadId,
    label: autoLabel,
    autoLabel,
    entityKeys: [],
    hosts,
    visitIds: [visit.visitId],
    visitCount: 1,
    totalDwellMs: visit.totalDwellMs,
    firstSeenAt: visit.startedAt,
    lastSeenAt: visit.lastSeenAt,
    createdAt: now,
    updatedAt: now,
    seedKey,
    windowId: visit.windowId,
    clusterKind: "session",
  };
}

export function assignVisitToThreadMap(
  visit: VisitRecord,
  threads: Map<string, ThreadRecord>,
  now: number,
): VisitRecord {
  const entitySeed = seedKeyForVisit(visit);
  if (entitySeed !== undefined) {
    const threadId = threadIdForSeed(entitySeed);
    const existing = threads.get(threadId);
    const thread =
      existing !== undefined
        ? mergeVisitIntoThread(existing, visit, now)
        : createThreadFromVisit(visit, now);

    if (thread === undefined) {
      return { ...visit, threadId: undefined };
    }

    threads.set(threadId, thread);
    return { ...visit, threadId: threadId };
  }

  const sessionThread = findSessionThreadForVisit(visit, threads);
  if (sessionThread !== undefined) {
    const merged = mergeVisitIntoThread(sessionThread, visit, now);
    threads.set(merged.threadId, merged);
    return { ...visit, threadId: merged.threadId };
  }

  const session = createSessionThreadFromVisit(visit, now);
  threads.set(session.threadId, session);
  return { ...visit, threadId: session.threadId };
}
