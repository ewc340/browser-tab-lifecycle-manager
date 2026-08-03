/**
 * Trivial thread clustering for M5 — one thread per primary entity key.
 */
import type { ThreadRecord, VisitRecord } from "./thread-types.ts";
import { buildThreadAutoLabel } from "./thread-label.ts";
import { primaryEntityKey } from "./entity-keys.ts";

export function seedKeyForVisit(visit: VisitRecord): string | undefined {
  return primaryEntityKey(visit.entityKeys);
}

export function threadIdForSeed(seedKey: string): string {
  const safe = seedKey.replace(/[^a-zA-Z0-9:+._-]/g, "_").slice(0, 120);
  return `thread_${safe}`;
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

  const autoLabel = buildThreadAutoLabel(thread.seedKey, entityKeys, visitCount, lastSeenAt);

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
  };
}

export function assignVisitToThreadMap(
  visit: VisitRecord,
  threads: Map<string, ThreadRecord>,
  now: number,
): VisitRecord {
  const seedKey = seedKeyForVisit(visit);
  if (seedKey === undefined) {
    return { ...visit, threadId: undefined };
  }

  const threadId = threadIdForSeed(seedKey);
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
