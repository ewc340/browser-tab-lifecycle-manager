import { describe, expect, it } from "vitest";
import type { AppState } from "../shared/types.ts";
import { DEFAULT_SETTINGS } from "../shared/defaults.ts";
import {
  getCachedAppState,
  invalidateAppStateCache,
  setCachedAppState,
} from "../background/app-state-cache.ts";

function sampleState(now: number): AppState {
  return {
    extensionVersion: "0.1.0",
    extensionId: "test-extension-id",
    settings: DEFAULT_SETTINGS,
    runtime: {
      browserStartedAt: now,
      lastSweepCompletedAt: now,
      lastRetentionRunAt: 0,
      reportOnlyUntil: 0,
      lastKnownVersion: "0.1.0",
      whatsNewVersion: "0.1.0",
      whatsNewSeenVersion: "0.1.0",
    },
    tabs: [],
    windows: [],
    counts: {
      total: 0,
      active: 0,
      background: 0,
      idle: 0,
      pendingClose: 0,
      unavailable: 0,
      locked: 0,
    },
    automationActive: true,
    now,
  };
}

describe("app-state-cache", () => {
  it("returns a fresh snapshot within the max age", () => {
    const now = Date.now();
    setCachedAppState(sampleState(now));
    expect(getCachedAppState(60_000)?.extensionVersion).toBe("0.1.0");
  });

  it("returns null after invalidate", () => {
    setCachedAppState(sampleState(Date.now()));
    invalidateAppStateCache();
    expect(getCachedAppState(60_000)).toBeNull();
  });
});
