/**
 * Visit and thread records for Milestone 5 — past context footprints.
 *
 * Visits are URL-level (SPA navigations within a tab create separate visits).
 * Threads group visits by entity keys or same-window session bursts (M5).
 */

export type VisitCloseReason = "USER" | "EXTENSION" | "NAVIGATION" | "UNKNOWN";

export interface VisitRecord {
  visitId: string;
  normalizedUrl: string;
  url: string;
  title: string;
  favIconUrl?: string | undefined;

  tabId: number;
  windowId: number;
  openerTabId?: number | undefined;
  groupId: number;

  entityKeys: string[];
  host: string;

  startedAt: number;
  lastSeenAt: number;
  endedAt?: number | undefined;
  totalDwellMs: number;
  focusCount: number;

  closeReason?: VisitCloseReason | undefined;
  threadId?: string | undefined;
}

export interface ThreadRecord {
  threadId: string;
  /** User-facing label; defaults to autoLabel until renamed (M10). */
  label: string;
  autoLabel: string;
  entityKeys: string[];
  hosts: string[];
  visitIds: string[];
  visitCount: number;
  totalDwellMs: number;
  firstSeenAt: number;
  lastSeenAt: number;
  createdAt: number;
  updatedAt: number;
  /** Primary entity key or `session:w{id}` for co-activation clusters. */
  seedKey?: string | undefined;
  /** Browser window for session-clustered threads. */
  windowId?: number | undefined;
  clusterKind?: "entity" | "session" | undefined;
}

export interface ThreadIndexEntry {
  threadId: string;
  seedKey: string;
}

export interface ThreadsSnapshot {
  threads: ThreadRecord[];
  visits: VisitRecord[];
  /** Open-tab visits still in progress (not yet threaded). */
  activeVisits: VisitRecord[];
  /** Visits not assigned to any thread yet. */
  orphanVisitCount: number;
  capturedThrough: number;
}
