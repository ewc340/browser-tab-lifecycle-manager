/**
 * Durable visit and thread storage in chrome.storage.local.
 */
import type { ThreadRecord, VisitRecord } from "../shared/thread-types.ts";
import { assignVisitToThreadMap } from "../shared/thread-cluster.ts";
import { getLocal, setLocal } from "./storage.ts";
import * as log from "../shared/log.ts";

export const LOCAL_KEY_VISITS = "visits:v1";
export const LOCAL_KEY_THREADS = "threads:v1";

export const VISIT_CAP = 5000;
export const THREAD_CAP = 500;

type VisitStore = Record<string, VisitRecord>;
type ThreadStore = Record<string, ThreadRecord>;

async function loadVisits(): Promise<VisitStore> {
  return getLocal<VisitStore>(LOCAL_KEY_VISITS, {});
}

async function loadThreads(): Promise<ThreadStore> {
  return getLocal<ThreadStore>(LOCAL_KEY_THREADS, {});
}

function evictByLastSeen<T extends { lastSeenAt: number }>(
  store: Record<string, T>,
  cap: number,
): Record<string, T> {
  const keys = Object.keys(store);
  if (keys.length <= cap) return store;

  const sorted = keys.sort((a, b) => store[a]!.lastSeenAt - store[b]!.lastSeenAt);
  const next = { ...store };
  for (let i = 0; i < keys.length - cap; i++) {
    delete next[sorted[i]!];
  }
  return next;
}

export async function persistVisit(visit: VisitRecord): Promise<VisitRecord> {
  let visits = await loadVisits();
  visits[visit.visitId] = visit;
  visits = evictByLastSeen(visits, VISIT_CAP);
  await setLocal({ [LOCAL_KEY_VISITS]: visits });
  return visit;
}

export async function closeAndAssignVisit(visit: VisitRecord, now: number): Promise<void> {
  const closed = { ...visit, endedAt: visit.endedAt ?? now };
  await persistVisit(closed);
  await assignVisitToThread(closed, now);
}

export async function assignVisitToThread(visit: VisitRecord, now: number): Promise<VisitRecord> {
  const threadsMap = new Map(Object.entries(await loadThreads()));
  const linked = assignVisitToThreadMap(visit, threadsMap, now);

  if (linked.threadId !== undefined) {
    const thread = threadsMap.get(linked.threadId);
    if (thread !== undefined) {
      let threadStore = Object.fromEntries(threadsMap);
      threadStore = evictByLastSeen(threadStore, THREAD_CAP);
      await setLocal({ [LOCAL_KEY_THREADS]: threadStore });

      const visits = await loadVisits();
      visits[linked.visitId] = linked;
      await setLocal({ [LOCAL_KEY_VISITS]: visits });
    }
  }

  return linked;
}

export async function listThreadsSince(sinceMs: number): Promise<ThreadRecord[]> {
  const threads = await loadThreads();
  return Object.values(threads)
    .filter((thread) => thread.lastSeenAt >= sinceMs)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

export async function listVisitsForThreads(threadIds: readonly string[]): Promise<VisitRecord[]> {
  if (threadIds.length === 0) return [];
  const visits = await loadVisits();
  const idSet = new Set(threadIds);
  return Object.values(visits).filter((visit) => visit.threadId !== undefined && idSet.has(visit.threadId));
}

export async function getThreadsSnapshot(sinceMs: number): Promise<{
  threads: ThreadRecord[];
  visits: VisitRecord[];
  orphanVisitCount: number;
}> {
  const [allVisits, threads] = await Promise.all([loadVisits(), loadThreads()]);
  const threadList = Object.values(threads)
    .filter((thread) => thread.lastSeenAt >= sinceMs)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);

  const threadIds = new Set(threadList.map((t) => t.threadId));
  const visits = Object.values(allVisits).filter(
    (visit) =>
      visit.lastSeenAt >= sinceMs &&
      visit.threadId !== undefined &&
      threadIds.has(visit.threadId),
  );

  const orphanVisitCount = Object.values(allVisits).filter(
    (visit) => visit.lastSeenAt >= sinceMs && visit.threadId === undefined && visit.endedAt !== undefined,
  ).length;

  return { threads: threadList, visits, orphanVisitCount };
}

export async function runThreadClusterPass(now: number): Promise<{ threads: number; visits: number }> {
  const visits = await loadVisits();
  const threadsMap = new Map(Object.entries(await loadThreads()));
  let assigned = 0;

  for (const visit of Object.values(visits)) {
    if (visit.threadId !== undefined) continue;
    if (visit.endedAt === undefined) continue;
    const linked = assignVisitToThreadMap(visit, threadsMap, now);
    if (linked.threadId !== undefined) {
      visits[visit.visitId] = linked;
      assigned++;
    }
  }

  let threadObj = Object.fromEntries(threadsMap);
  threadObj = evictByLastSeen(threadObj, THREAD_CAP);
  const visitObj = evictByLastSeen(visits, VISIT_CAP);

  await setLocal({
    [LOCAL_KEY_THREADS]: threadObj,
    [LOCAL_KEY_VISITS]: visitObj,
  });

  log.debug("thread cluster pass", assigned, "visits assigned", Object.keys(threadObj).length, "threads");
  return { threads: Object.keys(threadObj).length, visits: assigned };
}
