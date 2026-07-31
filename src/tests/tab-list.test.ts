import { describe, expect, it } from "vitest";
import type { TabView } from "../shared/types.ts";
import { applyTabListQuery, filterTabs, matchesSearch, sortTabs } from "../shared/tab-list.ts";

function makeTab(overrides: Partial<TabView> & { tabId: number }): TabView {
  const { tabId, ...rest } = overrides;
  return {
    tabId,
    windowId: 1,
    index: 0,
    groupId: -1,
    url: "https://example.com",
    normalizedUrl: "https://example.com/",
    title: "Example",
    firstObservedAt: 0,
    lastActivatedAt: 1000,
    lastUpdatedAt: 1000,
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    frozen: false,
    incognito: false,
    autoDiscardable: true,
    neverActivated: false,
    canDiscard: true,
    canClose: true,
    closeLocked: false,
    keepLoaded: false,
    inactivityCreditMs: 0,
    displayState: "BACKGROUND",
    inactiveMs: 0,
    ...rest,
  };
}

describe("matchesSearch", () => {
  it("matches title, host, and full url case-insensitively", () => {
    const tab = makeTab({
      tabId: 1,
      title: "Chrome Tabs API",
      url: "https://developer.chrome.com/docs/extensions/reference/api/tabs/",
    });
    expect(matchesSearch(tab, "tabs api")).toBe(true);
    expect(matchesSearch(tab, "DEVELOPER.CHROME")).toBe(true);
    expect(matchesSearch(tab, "/reference/api/tabs")).toBe(true);
    expect(matchesSearch(tab, "reddit")).toBe(false);
  });
});

describe("filterTabs", () => {
  const tabs = [
    makeTab({ tabId: 1, displayState: "ACTIVE", active: true }),
    makeTab({ tabId: 2, displayState: "IDLE", discarded: true }),
    makeTab({ tabId: 3, closeLocked: true, displayState: "BACKGROUND" }),
  ];

  it("filters by lifecycle state", () => {
    const idle = filterTabs(tabs, {
      search: "",
      stateFilter: "idle",
      windowFilter: "all",
      sort: "recent",
    });
    expect(idle.map((t) => t.tabId)).toEqual([2]);
  });

  it("filters locked tabs", () => {
    const locked = filterTabs(tabs, {
      search: "",
      stateFilter: "locked",
      windowFilter: "all",
      sort: "recent",
    });
    expect(locked.map((t) => t.tabId)).toEqual([3]);
  });
});

describe("sortTabs", () => {
  it("sorts by least recently active", () => {
    const tabs = [
      makeTab({ tabId: 1, lastActivatedAt: 300 }),
      makeTab({ tabId: 2, lastActivatedAt: 100 }),
      makeTab({ tabId: 3, lastActivatedAt: 200 }),
    ];
    const sorted = sortTabs(tabs, "oldest");
    expect(sorted.map((t) => t.tabId)).toEqual([2, 3, 1]);
  });

  it("puts focused window first when sorting by window", () => {
    const tabs = [
      makeTab({ tabId: 1, windowId: 2, index: 0 }),
      makeTab({ tabId: 2, windowId: 1, index: 1 }),
      makeTab({ tabId: 3, windowId: 1, index: 0 }),
    ];
    const sorted = sortTabs(tabs, "window", 1);
    expect(sorted.map((t) => t.tabId)).toEqual([3, 2, 1]);
  });
});

describe("applyTabListQuery", () => {
  it("combines search, filter, and sort", () => {
    const tabs = [
      makeTab({ tabId: 1, title: "Alpha", lastActivatedAt: 100 }),
      makeTab({ tabId: 2, title: "Beta docs", lastActivatedAt: 200 }),
      makeTab({ tabId: 3, title: "Gamma", lastActivatedAt: 300, displayState: "ACTIVE", active: true }),
    ];
    const result = applyTabListQuery(tabs, {
      search: "beta",
      stateFilter: "all",
      windowFilter: "all",
      sort: "title",
    });
    expect(result.map((t) => t.tabId)).toEqual([2]);
  });
});
