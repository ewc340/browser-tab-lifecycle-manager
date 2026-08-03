/**
 * Group visits and threads by host for compact Threads UI.
 */
import type { ThreadRecord, VisitRecord } from "./thread-types.ts";

export interface HostVisitGroup {
  host: string;
  visits: VisitRecord[];
}

export interface HostThreadGroup {
  host: string;
  threads: ThreadRecord[];
  visitCount: number;
}

export function hostKeyForVisit(visit: VisitRecord): string {
  return visit.host.length > 0 ? visit.host : "unknown";
}

export function primaryHostForThread(thread: ThreadRecord): string {
  if (thread.hosts.length > 0) return thread.hosts[0]!;
  if (thread.clusterKind === "session") return "session burst";
  return thread.seedKey ?? "misc";
}

export function groupVisitsByHost(visits: readonly VisitRecord[]): HostVisitGroup[] {
  const map = new Map<string, VisitRecord[]>();
  for (const visit of visits) {
    const host = hostKeyForVisit(visit);
    const list = map.get(host) ?? [];
    list.push(visit);
    map.set(host, list);
  }

  return [...map.entries()]
    .map(([host, groupVisits]) => ({
      host,
      visits: groupVisits.sort((a, b) => b.lastSeenAt - a.lastSeenAt),
    }))
    .sort((a, b) => b.visits.length - a.visits.length);
}

export function groupThreadsByHost(threads: readonly ThreadRecord[]): HostThreadGroup[] {
  const map = new Map<string, ThreadRecord[]>();
  for (const thread of threads) {
    const host = primaryHostForThread(thread);
    const list = map.get(host) ?? [];
    list.push(thread);
    map.set(host, list);
  }

  return [...map.entries()]
    .map(([host, groupThreads]) => ({
      host,
      threads: groupThreads.sort((a, b) => b.lastSeenAt - a.lastSeenAt),
      visitCount: groupThreads.reduce((sum, t) => sum + t.visitCount, 0),
    }))
    .sort((a, b) => b.visitCount - a.visitCount);
}
