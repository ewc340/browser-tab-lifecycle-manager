import { describe, expect, it } from "vitest";
import {
  classifyManageability,
  computeInactiveMs,
  deriveDisplayState,
  hostMatches,
} from "../shared/eligibility.ts";
import type { ManagedTabRecord } from "../shared/types.ts";

// ── classifyManageability ─────────────────────────────────────────────────────

describe("classifyManageability", () => {
  it("allows discard and close for a normal https:// tab", () => {
    const result = classifyManageability({
      url: "https://example.com",
      incognito: false,
      windowType: "normal",
    });
    expect(result.canDiscard).toBe(true);
    expect(result.canClose).toBe(true);
    expect(result.unavailableReason).toBeUndefined();
  });

  it("blocks both actions for chrome://settings", () => {
    const result = classifyManageability({
      url: "chrome://settings",
      incognito: false,
      windowType: "normal",
    });
    expect(result.canDiscard).toBe(false);
    expect(result.canClose).toBe(false);
    expect(result.unavailableReason).toBe("PRIVILEGED_PAGE");
  });

  it("allows closing (but not discarding) chrome://newtab/ with empty title", () => {
    const result = classifyManageability({
      url: "chrome://newtab/",
      title: "",
      incognito: false,
      windowType: "normal",
    });
    expect(result.canDiscard).toBe(false);
    expect(result.canClose).toBe(true);
    expect(result.isNewTabPage).toBe(true);
  });

  it("treats about:blank with an empty title as a new-tab page (closeable, not discardable)", () => {
    const result = classifyManageability({
      url: "about:blank",
      title: "",
      incognito: false,
      windowType: "normal",
    });
    expect(result.canClose).toBe(true);
    expect(result.canDiscard).toBe(false);
    expect(result.isNewTabPage).toBe(true);
  });

  it("allows discard but not close for file:///x.pdf", () => {
    const result = classifyManageability({
      url: "file:///x.pdf",
      incognito: false,
      windowType: "normal",
    });
    expect(result.canDiscard).toBe(true);
    expect(result.canClose).toBe(false);
    expect(result.unavailableReason).toBe("LOCAL_FILE");
  });

  it("blocks both actions for devtools://", () => {
    const result = classifyManageability({
      url: "devtools://devtools/bundled/inspector.html",
      incognito: false,
      windowType: "normal",
    });
    expect(result.canDiscard).toBe(false);
    expect(result.canClose).toBe(false);
    expect(result.unavailableReason).toBe("PRIVILEGED_PAGE");
  });

  it("blocks both actions for data: URLs", () => {
    const result = classifyManageability({
      url: "data:text/html,<h1>Hello</h1>",
      incognito: false,
      windowType: "normal",
    });
    expect(result.canDiscard).toBe(false);
    expect(result.canClose).toBe(false);
    expect(result.unavailableReason).toBe("PRIVILEGED_PAGE");
  });

  it("blocks both actions for incognito tabs", () => {
    const result = classifyManageability({
      url: "https://example.com",
      incognito: true,
      windowType: "normal",
    });
    expect(result.canDiscard).toBe(false);
    expect(result.canClose).toBe(false);
    expect(result.unavailableReason).toBe("INCOGNITO");
  });

  it("blocks both actions for popup window type", () => {
    const result = classifyManageability({
      url: "https://example.com",
      incognito: false,
      windowType: "popup",
    });
    expect(result.canDiscard).toBe(false);
    expect(result.canClose).toBe(false);
    expect(result.unavailableReason).toBe("NON_NORMAL_WINDOW");
  });

  it("treats about:blank with title 'about:blank' as a new-tab page (closeable, not discardable)", () => {
    const result = classifyManageability({
      url: "about:blank",
      title: "about:blank",
      incognito: false,
      windowType: "normal",
    });
    expect(result.canClose).toBe(true);
    expect(result.canDiscard).toBe(false);
    expect(result.isNewTabPage).toBe(true);
    expect(result.unavailableReason).toBeUndefined();
  });

  it("treats chrome://newtab/ with title 'New Tab' as a new-tab page (closeable, not discardable)", () => {
    const result = classifyManageability({
      url: "chrome://newtab/",
      title: "New Tab",
      incognito: false,
      windowType: "normal",
    });
    expect(result.canClose).toBe(true);
    expect(result.canDiscard).toBe(false);
    expect(result.isNewTabPage).toBe(true);
    expect(result.unavailableReason).toBeUndefined();
  });

  it("treats chrome://newtab/ with a substantive title as a privileged page (unavailable)", () => {
    const result = classifyManageability({
      url: "chrome://newtab/",
      title: "My Homepage",
      incognito: false,
      windowType: "normal",
    });
    expect(result.canClose).toBe(false);
    expect(result.canDiscard).toBe(false);
    expect(result.isNewTabPage).toBe(false);
    expect(result.unavailableReason).toBe("PRIVILEGED_PAGE");
  });
});

// ── deriveDisplayState ────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<ManagedTabRecord> = {}): ManagedTabRecord {
  return {
    tabId: 1,
    windowId: 1,
    index: 0,
    groupId: -1,
    url: "https://example.com",
    normalizedUrl: "https://example.com/",
    title: "Example",
    firstObservedAt: 0,
    lastActivatedAt: 0,
    lastUpdatedAt: 0,
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
    ...overrides,
  };
}

describe("deriveDisplayState", () => {
  const now = 1_000_000;

  it("returns UNAVAILABLE when canDiscard and canClose are both false", () => {
    const record = makeRecord({ canDiscard: false, canClose: false });
    expect(deriveDisplayState(record, now)).toBe("UNAVAILABLE");
  });

  it("returns ACTIVE for an active tab", () => {
    const record = makeRecord({ active: true });
    expect(deriveDisplayState(record, now)).toBe("ACTIVE");
  });

  it("ACTIVE outranks PENDING_CLOSE (active tab with future pendingCloseAt shows ACTIVE)", () => {
    const record = makeRecord({ active: true, pendingCloseAt: now + 60_000 });
    expect(deriveDisplayState(record, now)).toBe("ACTIVE");
  });

  it("returns PENDING_CLOSE when pendingCloseAt is in the future and tab is not active", () => {
    const record = makeRecord({ active: false, pendingCloseAt: now + 60_000 });
    expect(deriveDisplayState(record, now)).toBe("PENDING_CLOSE");
  });

  it("does not show PENDING_CLOSE when pendingCloseAt is in the past", () => {
    const record = makeRecord({ active: false, pendingCloseAt: now - 1 });
    expect(deriveDisplayState(record, now)).not.toBe("PENDING_CLOSE");
  });

  it("returns IDLE for a discarded background tab", () => {
    const record = makeRecord({ discarded: true, active: false });
    expect(deriveDisplayState(record, now)).toBe("IDLE");
  });

  it("returns BACKGROUND for a loaded, inactive, not-discarded tab", () => {
    const record = makeRecord({ discarded: false, active: false });
    expect(deriveDisplayState(record, now)).toBe("BACKGROUND");
  });

  it("UNAVAILABLE outranks ACTIVE", () => {
    const record = makeRecord({ canDiscard: false, canClose: false, active: true });
    expect(deriveDisplayState(record, now)).toBe("UNAVAILABLE");
  });
});

// ── computeInactiveMs ─────────────────────────────────────────────────────────

describe("computeInactiveMs", () => {
  it("returns elapsed time minus inactivityCreditMs", () => {
    const record = { lastActivatedAt: 0, inactivityCreditMs: 1000 };
    expect(computeInactiveMs(record, 5000)).toBe(4000);
  });

  it("clamps to zero when credit exceeds elapsed", () => {
    const record = { lastActivatedAt: 0, inactivityCreditMs: 10_000 };
    expect(computeInactiveMs(record, 5000)).toBe(0);
  });

  it("clamps to zero when now is less than lastActivatedAt (clock correction)", () => {
    const record = { lastActivatedAt: 10_000, inactivityCreditMs: 0 };
    expect(computeInactiveMs(record, 5000)).toBe(0);
  });

  it("returns zero for a tab just activated (lastActivatedAt === now)", () => {
    const record = { lastActivatedAt: 5000, inactivityCreditMs: 0 };
    expect(computeInactiveMs(record, 5000)).toBe(0);
  });

  it("honours inactivityCreditMs of zero", () => {
    const record = { lastActivatedAt: 0, inactivityCreditMs: 0 };
    expect(computeInactiveMs(record, 3600_000)).toBe(3600_000);
  });
});

// ── hostMatches ───────────────────────────────────────────────────────────────

describe("hostMatches", () => {
  it("returns false for an empty pattern list", () => {
    expect(hostMatches("https://example.com", [])).toBe(false);
  });

  it("matches an exact hostname", () => {
    expect(hostMatches("https://example.com", ["example.com"])).toBe(true);
  });

  it("does not match a different hostname", () => {
    expect(hostMatches("https://other.com", ["example.com"])).toBe(false);
  });

  it("matches a wildcard *.example.com against a subdomain", () => {
    expect(hostMatches("https://sub.example.com", ["*.example.com"])).toBe(true);
  });

  it("matches a wildcard *.example.com against the bare domain itself", () => {
    expect(hostMatches("https://example.com", ["*.example.com"])).toBe(true);
  });

  it("does not match *.example.com against an unrelated domain", () => {
    expect(hostMatches("https://notexample.com", ["*.example.com"])).toBe(false);
  });

  it("is case-insensitive for the pattern", () => {
    expect(hostMatches("https://EXAMPLE.COM", ["example.com"])).toBe(true);
  });

  it("returns false for a URL with no host (about:blank)", () => {
    expect(hostMatches("about:blank", ["about"])).toBe(false);
  });

  it("matches when multiple patterns are given and one matches", () => {
    expect(hostMatches("https://example.com", ["other.com", "example.com"])).toBe(true);
  });
});
