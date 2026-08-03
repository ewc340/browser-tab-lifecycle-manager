import { describe, expect, it } from "vitest";
import {
  assignVisitToThreadMap,
  consolidateSessionThreads,
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

  it("merges keyless visits with old startedAt when ended recently", () => {
    const threads = new Map<string, ThreadRecord>();
    const now = 10_000_000;
    const first = assignVisitToThreadMap(
      makeVisit({
        visitId: "v1",
        entityKeys: [],
        startedAt: now - 3 * 24 * 60 * 60 * 1000,
        lastSeenAt: now,
        endedAt: now,
        host: "a.com",
      }),
      threads,
      now,
    );
    const second = assignVisitToThreadMap(
      makeVisit({
        visitId: "v2",
        entityKeys: [],
        startedAt: now - 2 * 24 * 60 * 60 * 1000,
        lastSeenAt: now,
        endedAt: now,
        host: "b.com",
      }),
      threads,
      now,
    );
    expect(first.threadId).toBe(second.threadId);
    expect(threads.size).toBe(1);
  });

  it("consolidates fragmented session threads in the same window", () => {
    const threads = new Map<string, ThreadRecord>();
    const now = 20_000;
    threads.set("t1", {
      threadId: "t1",
      label: "a",
      autoLabel: "a",
      entityKeys: [],
      hosts: ["a.com"],
      visitIds: ["v1"],
      visitCount: 1,
      totalDwellMs: 100,
      firstSeenAt: 1000,
      lastSeenAt: 2000,
      createdAt: 1000,
      updatedAt: now,
      seedKey: "session:w1",
      windowId: 1,
      clusterKind: "session",
    });
    threads.set("t2", {
      threadId: "t2",
      label: "b",
      autoLabel: "b",
      entityKeys: [],
      hosts: ["b.com"],
      visitIds: ["v2"],
      visitCount: 1,
      totalDwellMs: 100,
      firstSeenAt: 2500,
      lastSeenAt: 3000,
      createdAt: 2500,
      updatedAt: now,
      seedKey: "session:w1",
      windowId: 1,
      clusterKind: "session",
    });
    const redirects = consolidateSessionThreads(threads, now);
    expect(redirects.size).toBe(1);
    expect(threads.size).toBe(1);
    const merged = [...threads.values()][0];
    expect(merged?.visitCount).toBe(2);
    expect(merged?.hosts).toContain("a.com");
    expect(merged?.hosts).toContain("b.com");
  });

  it("links child visit to opener thread across sites (topic)", () => {
    const visits = new Map<string, VisitRecord>();
    const threads = new Map<string, ThreadRecord>();
    const now = 10_000;

    const search = assignVisitToThreadMap(
      makeVisit({
        visitId: "v_search",
        entityKeys: ["search:tennis robot"],
        host: "google.com",
        endedAt: 2000,
      }),
      threads,
      now,
      visits,
    );
    visits.set("v_search", search);

    const reddit = assignVisitToThreadMap(
      makeVisit({
        visitId: "v_reddit",
        entityKeys: ["reddit:abc"],
        host: "reddit.com",
        openerVisitId: "v_search",
        startedAt: 2500,
        lastSeenAt: 3000,
        endedAt: 3000,
      }),
      threads,
      now,
      visits,
    );

    expect(reddit.threadId).toBe(search.threadId);
    const thread = threads.get(reddit.threadId ?? "");
    expect(thread?.clusterKind).toBe("topic");
    expect(thread?.hosts).toContain("google.com");
    expect(thread?.hosts).toContain("reddit.com");
  });
});
