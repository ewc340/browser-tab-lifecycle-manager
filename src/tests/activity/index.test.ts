import { describe, expect, it } from "vitest";
import {
  decodeCursor,
  encodeCursor,
  EVENTS_PER_BUCKET,
  planActivityPage,
  type ActivityIndex,
} from "../../shared/activity-index.ts";

describe("activity index", () => {
  it("round-trips cursors", () => {
    const raw = encodeCursor({ bucket: "123", offset: 40 });
    expect(decodeCursor(raw)).toEqual({ bucket: "123", offset: 40 });
  });

  it("plans first page from newest bucket", () => {
    const index: ActivityIndex = {
      buckets: ["100", "200"],
      newestBucket: "200",
      count: 150,
    };
    const plan = planActivityPage(index, undefined, 50);
    expect(plan.eventsFromBuckets[0]).toEqual({ bucketId: "200", start: 0, take: 50 });
    expect(plan.nextCursor).toBe(encodeCursor({ bucket: "200", offset: 50 }));
  });

  it("spans buckets when page crosses boundary", () => {
    const index: ActivityIndex = {
      buckets: ["100", "200"],
      newestBucket: "200",
      count: EVENTS_PER_BUCKET + 10,
    };
    const plan = planActivityPage(index, { bucket: "200", offset: 95 }, 10);
    expect(plan.eventsFromBuckets.length).toBeGreaterThanOrEqual(1);
  });
});
