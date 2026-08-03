import { describe, expect, it } from "vitest";
import { groupThreadsByHost, groupVisitsByHost } from "../shared/visit-groups.ts";
import type { ThreadRecord, VisitRecord } from "../shared/thread-types.ts";

function makeVisit(host: string, id: string): VisitRecord {
  return {
    visitId: id,
    normalizedUrl: `https://${host}/`,
    url: `https://${host}/`,
    title: id,
    tabId: 1,
    windowId: 1,
    groupId: -1,
    entityKeys: [],
    host,
    startedAt: 1000,
    lastSeenAt: 2000,
    totalDwellMs: 100,
    focusCount: 1,
  };
}

describe("visit-groups", () => {
  it("groups visits by host sorted by count", () => {
    const groups = groupVisitsByHost([
      makeVisit("a.com", "v1"),
      makeVisit("b.com", "v2"),
      makeVisit("a.com", "v3"),
    ]);
    expect(groups[0]?.host).toBe("a.com");
    expect(groups[0]?.visits.length).toBe(2);
  });

  it("groups threads by primary host", () => {
    const thread: ThreadRecord = {
      threadId: "t1",
      label: "test",
      autoLabel: "test",
      entityKeys: [],
      hosts: ["reddit.com"],
      visitIds: ["v1", "v2"],
      visitCount: 2,
      totalDwellMs: 100,
      firstSeenAt: 1000,
      lastSeenAt: 2000,
      createdAt: 1000,
      updatedAt: 2000,
      clusterKind: "session",
    };
    const groups = groupThreadsByHost([thread]);
    expect(groups[0]?.host).toBe("reddit.com");
    expect(groups[0]?.visitCount).toBe(2);
  });
});
