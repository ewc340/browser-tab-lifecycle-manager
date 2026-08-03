import { describe, expect, it } from "vitest";
import {
  assignVisitToThreadMap,
  createThreadFromVisit,
  threadIdForSeed,
} from "../shared/thread-cluster.ts";
import type { ThreadRecord, VisitRecord } from "../shared/thread-types.ts";

function makeVisit(overrides: Partial<VisitRecord> = {}): VisitRecord {
  return {
    visitId: "v1",
    normalizedUrl: "https://jira.example.com/browse/PROJ-1",
    url: "https://jira.example.com/browse/PROJ-1",
    title: "PROJ-1",
    tabId: 1,
    windowId: 1,
    groupId: -1,
    entityKeys: ["PROJ-1"],
    host: "jira.example.com",
    startedAt: 1000,
    lastSeenAt: 2000,
    totalDwellMs: 5000,
    focusCount: 2,
    endedAt: 2000,
    ...overrides,
  };
}

describe("thread clustering", () => {
  it("creates thread id from seed key", () => {
    expect(threadIdForSeed("PROJ-1")).toBe("thread_PROJ-1");
  });

  it("creates thread from visit with entity key", () => {
    const thread = createThreadFromVisit(makeVisit(), 3000);
    expect(thread).toBeDefined();
    expect(thread!.seedKey).toBe("PROJ-1");
    expect(thread!.visitIds).toEqual(["v1"]);
  });

  it("merges visits with same entity key", () => {
    const threads = new Map<string, ThreadRecord>();
    const now = 5000;
    const first = assignVisitToThreadMap(makeVisit(), threads, now);
    const second = assignVisitToThreadMap(
      makeVisit({ visitId: "v2", startedAt: 3000, lastSeenAt: 4000 }),
      threads,
      now,
    );
    expect(first.threadId).toBe(second.threadId);
    const thread = threads.get(first.threadId ?? "");
    expect(thread?.visitCount).toBe(2);
  });

  it("leaves visit unthreaded without entity keys", () => {
    const threads = new Map<string, ThreadRecord>();
    const linked = assignVisitToThreadMap(
      makeVisit({ entityKeys: [], endedAt: 2000 }),
      threads,
      5000,
    );
    expect(linked.threadId).toBeDefined();
    expect(threads.size).toBe(1);
    const thread = threads.get(linked.threadId ?? "");
    expect(thread?.clusterKind).toBe("session");
  });

  it("merges keyless visits in the same window session", () => {
    const threads = new Map<string, ThreadRecord>();
    const now = 5000;
    const first = assignVisitToThreadMap(
      makeVisit({ visitId: "v1", entityKeys: [], endedAt: 2000, host: "a.com" }),
      threads,
      now,
    );
    const second = assignVisitToThreadMap(
      makeVisit({
        visitId: "v2",
        entityKeys: [],
        startedAt: 2500,
        lastSeenAt: 3000,
        endedAt: 3000,
        host: "b.com",
      }),
      threads,
      now,
    );
    expect(first.threadId).toBe(second.threadId);
    const thread = threads.get(first.threadId ?? "");
    expect(thread?.visitCount).toBe(2);
    expect(thread?.hosts).toContain("a.com");
    expect(thread?.hosts).toContain("b.com");
  });
});
