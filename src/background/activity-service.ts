/**
 * Chunked activity event storage with cursor paging and retention (Milestone 3).
 */
import type { ActivityEvent, ActivityEventType, ActivitySource, TabSnapshot } from "../shared/types.ts";
import {
  bucketKeyForId,
  EVENTS_PER_BUCKET,
  makeBucketId,
  planActivityPage,
  type ActivityIndex,
  type ActivityPageCursor,
  decodeCursor,
} from "../shared/activity-index.ts";
import { loadSettings } from "./settings-service.ts";
import {
  getLocal,
  setLocal,
  removeLocal,
  LOCAL_KEY_ACTIVITY_INDEX,
} from "./storage.ts";

const LEGACY_BUCKET_KEY = "activityEvents:v1:0000";

function newEventId(): string {
  return crypto.randomUUID();
}

async function loadIndex(): Promise<ActivityIndex> {
  return getLocal<ActivityIndex>(LOCAL_KEY_ACTIVITY_INDEX, {
    buckets: [],
    newestBucket: "",
    count: 0,
  });
}

async function saveIndex(index: ActivityIndex): Promise<void> {
  await setLocal({ [LOCAL_KEY_ACTIVITY_INDEX]: index });
}

async function loadBucket(bucketId: string): Promise<ActivityEvent[]> {
  return getLocal<ActivityEvent[]>(bucketKeyForId(bucketId), []);
}

async function saveBucket(bucketId: string, events: ActivityEvent[]): Promise<void> {
  await setLocal({ [bucketKeyForId(bucketId)]: events });
}

/** Migrates the M2 single-bucket layout into the chunked index. */
async function migrateLegacyBucketIfNeeded(): Promise<void> {
  const legacy = await getLocal<ActivityEvent[] | undefined>(LEGACY_BUCKET_KEY, undefined);
  if (legacy === undefined || legacy.length === 0) return;

  const index = await loadIndex();
  if (index.count > 0) return;

  const bucketId = makeBucketId(Date.now());
  await saveBucket(bucketId, legacy.slice(0, EVENTS_PER_BUCKET));
  await saveIndex({
    buckets: [bucketId],
    newestBucket: bucketId,
    count: Math.min(legacy.length, EVENTS_PER_BUCKET),
  });
  await removeLocal([LEGACY_BUCKET_KEY]);
}

export async function appendActivityEvent(
  partial: Omit<ActivityEvent, "id" | "occurredAt"> & { occurredAt?: number },
): Promise<ActivityEvent> {
  await migrateLegacyBucketIfNeeded();

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

  let index = await loadIndex();
  let bucketId = index.newestBucket;

  if (bucketId.length === 0) {
    bucketId = makeBucketId(event.occurredAt);
    index = { buckets: [bucketId], newestBucket: bucketId, count: 0 };
  }

  let bucket = await loadBucket(bucketId);
  if (bucket.length >= EVENTS_PER_BUCKET) {
    bucketId = makeBucketId(event.occurredAt);
    bucket = [];
    index.buckets.push(bucketId);
    index.newestBucket = bucketId;
  }

  bucket = [event, ...bucket];
  await saveBucket(bucketId, bucket);
  index.count += 1;
  await saveIndex(index);

  const settings = await loadSettings();
  await enforceActivityRetention(settings.maximumActivityEvents, settings.activityRetentionDays);

  return event;
}

export async function getActivityPage(
  cursor?: string,
  limit = 50,
): Promise<{ events: ActivityEvent[]; nextCursor?: string }> {
  await migrateLegacyBucketIfNeeded();
  const index = await loadIndex();
  if (index.count === 0) return { events: [] };

  const decoded: ActivityPageCursor | undefined = decodeCursor(cursor);
  const plan = planActivityPage(index, decoded, limit);
  const events: ActivityEvent[] = [];

  for (const slice of plan.eventsFromBuckets) {
    const bucket = await loadBucket(slice.bucketId);
    events.push(...bucket.slice(slice.start, slice.start + slice.take));
  }

  return {
    events,
    ...(plan.nextCursor !== undefined ? { nextCursor: plan.nextCursor } : {}),
  };
}

export async function getRecentActivity(limit = 50): Promise<ActivityEvent[]> {
  const page = await getActivityPage(undefined, limit);
  return page.events;
}

export async function clearAllActivity(): Promise<void> {
  const index = await loadIndex();
  const keys = index.buckets.map((id) => bucketKeyForId(id));
  keys.push(LEGACY_BUCKET_KEY);
  await removeLocal(keys);
  await saveIndex({ buckets: [], newestBucket: "", count: 0 });
}

export async function exportActivityJson(): Promise<string> {
  const index = await loadIndex();
  const all: ActivityEvent[] = [];
  for (const bucketId of [...index.buckets].reverse()) {
    all.push(...(await loadBucket(bucketId)));
  }
  return JSON.stringify(all, null, 2);
}

export async function enforceActivityRetention(
  maxEvents: number,
  retentionDays: number,
): Promise<number> {
  const index = await loadIndex();
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  let removed = 0;
  const survivingBuckets: string[] = [];

  for (const bucketId of index.buckets) {
    const bucket = await loadBucket(bucketId);
    const filtered = bucket.filter((event) => event.occurredAt >= cutoff);
    removed += bucket.length - filtered.length;

    if (filtered.length === 0) {
      await removeLocal([bucketKeyForId(bucketId)]);
    } else {
      await saveBucket(bucketId, filtered);
      survivingBuckets.push(bucketId);
    }
  }

  let count = 0;
  for (const bucketId of [...survivingBuckets].reverse()) {
    const bucket = await loadBucket(bucketId);
    count += bucket.length;
  }

  while (count > maxEvents && survivingBuckets.length > 0) {
    const oldestId = survivingBuckets.shift()!;
    const bucket = await loadBucket(oldestId);
    removed += bucket.length;
    count -= bucket.length;
    await removeLocal([bucketKeyForId(oldestId)]);
  }

  const nextIndex: ActivityIndex = {
    buckets: survivingBuckets,
    newestBucket: survivingBuckets[survivingBuckets.length - 1] ?? "",
    count,
  };
  await saveIndex(nextIndex);
  return removed;
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

export async function linkRecoveryToActivity(
  recoveryId: string,
  activityEventId: string,
): Promise<void> {
  const { patchRecoveryActivityId } = await import("./recovery-service.ts");
  await patchRecoveryActivityId(recoveryId, activityEventId);
}
