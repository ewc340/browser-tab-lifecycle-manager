/**
 * Shared fixtures for lifecycle evaluator and orchestration tests.
 */
import type { EvaluationContext } from "../../shared/lifecycle.ts";
import type { ExtensionSettings, ManagedTabRecord } from "../../shared/types.ts";
import { DEFAULT_SETTINGS } from "../../shared/defaults.ts";
import { DAY, HOUR, MINUTE } from "../../shared/time.ts";

export const BASE_NOW = 1_700_000_000_000;

export function enabledSettings(overrides: Partial<ExtensionSettings> = {}): ExtensionSettings {
  return {
    ...DEFAULT_SETTINGS,
    onboardingCompleted: true,
    sleepEnabled: true,
    autoCloseEnabled: true,
    sleepAfterMinutes: 60,
    closeAfterMinutes: 120,
    closeGraceMinutes: 10,
    ...overrides,
  };
}

export function baseContext(overrides: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    now: BASE_NOW,
    browserStartedAt: BASE_NOW - 2 * HOUR,
    lastSweepCompletedAt: BASE_NOW - 5 * MINUTE,
    closuresThisSweep: 0,
    closuresThisHour: 0,
    discardsThisSweep: 0,
    reportOnlyClosing: false,
    ...overrides,
  };
}

export function makeTab(overrides: Partial<ManagedTabRecord> = {}): ManagedTabRecord {
  const now = BASE_NOW;
  return {
    tabId: 1,
    windowId: 1,
    index: 0,
    groupId: -1,
    url: "https://example.com/page",
    normalizedUrl: "https://example.com/page",
    title: "Example",
    firstObservedAt: now - 2 * DAY,
    lastActivatedAt: now - 90 * MINUTE,
    lastUpdatedAt: now,
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

export function inactiveTab(minutes: number, overrides: Partial<ManagedTabRecord> = {}): ManagedTabRecord {
  return makeTab({
    lastActivatedAt: BASE_NOW - minutes * MINUTE,
    ...overrides,
  });
}

export function hasAction(
  result: { actions: readonly string[] },
  action: string,
): boolean {
  return result.actions.includes(action);
}
