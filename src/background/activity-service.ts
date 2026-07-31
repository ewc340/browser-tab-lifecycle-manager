/**
 * Minimal activity append for Milestone 2. Full retention/chunking arrives in M3.
 */
import type { ActivityEvent, ActivityEventType, ActivitySource, TabSnapshot } from "../shared/types.ts";
import { getLocal, setLocal } from "./storage.ts";

const ACTIVITY_BUCKET_KEY = "activityEvents:v1:0000";

function newEventId(): string {
  return crypto.randomUUID();
}

export async function appendActivityEvent(
  partial: Omit<ActivityEvent, "id" | "occurredAt"> & { occurredAt?: number },
): Promise<ActivityEvent> {
  const event: ActivityEvent = {
    id: newEventId(),
    occurredAt: partial.occurredAt ?? Date.now(),
    type: partial.type,
    source: partial.source,
    message: partial.message,
    reason: partial.reason,
    tabs: partial.tabs,
    reversible: partial.reversible,
    relatedRecoveryIds: partial.relatedRecoveryIds,
    metadata: partial.metadata,
  };

  const existing = await getLocal<ActivityEvent[]>(ACTIVITY_BUCKET_KEY, []);
  const next = [event, ...existing].slice(0, 500);
  await setLocal({ [ACTIVITY_BUCKET_KEY]: next });
  return event;
}

export async function getRecentActivity(limit = 50): Promise<ActivityEvent[]> {
  const events = await getLocal<ActivityEvent[]>(ACTIVITY_BUCKET_KEY, []);
  return events.slice(0, limit);
}

export function tabSnapshotFromRecord(
  record: {
    tabId: number;
    windowId: number;
    index: number;
    title: string;
    url: string;
  },
): TabSnapshot {
  return {
    tabId: record.tabId,
    windowId: record.windowId,
    index: record.index,
    title: record.title,
    url: record.url,
  };
}

export async function appendAggregateEvent(
  type: ActivityEventType,
  source: ActivitySource,
  message: string,
  tabs: TabSnapshot[],
  reason?: string,
  metadata?: ActivityEvent["metadata"],
): Promise<ActivityEvent> {
  const capped = tabs.slice(0, 20);
  return appendActivityEvent({
    type,
    source,
    message,
    reason,
    tabs: capped,
    reversible: false,
    metadata: {
      totalCount: tabs.length,
      ...metadata,
    },
  });
}
