/**
 * Activity bucket index helpers — pure, unit-testable.
 */
export const ACTIVITY_BUCKET_PREFIX = "activityEvents:v1:";
export const EVENTS_PER_BUCKET = 100;

export interface ActivityIndex {
  buckets: string[];
  newestBucket: string;
  count: number;
}

export interface ActivityPageCursor {
  bucket: string;
  offset: number;
}

export function bucketKeyForId(bucketId: string): string {
  return `${ACTIVITY_BUCKET_PREFIX}${bucketId}`;
}

export function makeBucketId(at: number): string {
  return String(at);
}

export function encodeCursor(cursor: ActivityPageCursor): string {
  return `${cursor.bucket}:${cursor.offset}`;
}

export function decodeCursor(raw: string | undefined): ActivityPageCursor | undefined {
  if (raw === undefined || raw.length === 0) return undefined;
  const sep = raw.indexOf(":");
  if (sep <= 0) return undefined;
  const bucket = raw.slice(0, sep);
  const offset = Number(raw.slice(sep + 1));
  if (!Number.isFinite(offset) || offset < 0) return undefined;
  return { bucket, offset };
}

/** Returns the next page of event ids to read from buckets (newest first). */
export function planActivityPage(
  index: ActivityIndex,
  cursor: ActivityPageCursor | undefined,
  limit: number,
): { eventsFromBuckets: { bucketId: string; start: number; take: number }[]; nextCursor?: string } {
  const buckets = [...index.buckets].reverse();
  const startBucket = cursor?.bucket;
  const startOffset = cursor?.offset ?? 0;

  let bucketIdx = startBucket === undefined ? 0 : buckets.indexOf(startBucket);
  if (bucketIdx < 0) bucketIdx = 0;

  const plan: { bucketId: string; start: number; take: number }[] = [];
  let remaining = limit;
  let offset = startOffset;

  for (let i = bucketIdx; i < buckets.length && remaining > 0; i++) {
    const bucketId = buckets[i]!;
    const take = Math.min(remaining, EVENTS_PER_BUCKET - offset);
    if (take > 0) {
      plan.push({ bucketId, start: offset, take });
      remaining -= take;
    }
    offset = 0;
  }

  if (plan.length === 0) return { eventsFromBuckets: [] };

  const last = plan[plan.length - 1]!;
  const nextOffset = last.start + last.take;
  const lastBucketEvents = EVENTS_PER_BUCKET;
  let nextCursor: string | undefined;

  if (nextOffset < lastBucketEvents) {
    nextCursor = encodeCursor({ bucket: last.bucketId, offset: nextOffset });
  } else {
    const lastBucketIndex = buckets.indexOf(last.bucketId);
    const nextBucket = buckets[lastBucketIndex + 1];
    if (nextBucket !== undefined) {
      nextCursor = encodeCursor({ bucket: nextBucket, offset: 0 });
    }
  }

  const result: { eventsFromBuckets: typeof plan; nextCursor?: string } = {
    eventsFromBuckets: plan,
  };
  if (nextCursor !== undefined) result.nextCursor = nextCursor;
  return result;
}
