/**
 * Lifecycle evaluator — PRD §30.1 cases plus M2 safety rails.
 */
import { describe, expect, it } from "vitest";
import {
  evaluateTab,
  reanchorPendingClose,
  SWEEP_LIMITS,
  TAB_MIN_AGE_CLOSE_MS,
} from "../../shared/lifecycle.ts";
import { DAY, HOUR, MINUTE } from "../../shared/time.ts";
import {
  BASE_NOW,
  baseContext,
  enabledSettings,
  hasAction,
  inactiveTab,
  makeTab,
} from "./fixtures.ts";

describe("evaluateTab — PRD §30.1 core cases", () => {
  it("1. active tab never sleeps", () => {
    const tab = inactiveTab(120, { active: true });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(result.actions).toEqual(["NONE"]);
  });

  it("2. active tab never closes", () => {
    const tab = inactiveTab(200, { active: true, pendingCloseAt: BASE_NOW + MINUTE });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(hasAction(result, "CLOSE")).toBe(false);
    expect(hasAction(result, "CANCEL_CLOSE")).toBe(true);
  });

  it("3. pinned tab never sleeps automatically", () => {
    const tab = inactiveTab(120, { pinned: true });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(hasAction(result, "SLEEP")).toBe(false);
  });

  it("4. pinned tab never closes automatically", () => {
    const tab = inactiveTab(200, { pinned: true, pendingCloseAt: BASE_NOW + MINUTE });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(hasAction(result, "CLOSE")).toBe(false);
    expect(hasAction(result, "CANCEL_CLOSE")).toBe(true);
  });

  it("5. audible tab never sleeps automatically", () => {
    const tab = inactiveTab(120, { audible: true });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(hasAction(result, "SLEEP")).toBe(false);
  });

  it("6. audible tab never closes automatically", () => {
    const tab = inactiveTab(200, { audible: true, pendingCloseAt: BASE_NOW + MINUTE });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(hasAction(result, "CLOSE")).toBe(false);
    expect(hasAction(result, "CANCEL_CLOSE")).toBe(true);
  });

  it("7. locked background tab sleeps after the sleep threshold", () => {
    const tab = inactiveTab(90, { closeLocked: true });
    const result = evaluateTab(tab, enabledSettings({ sleepAfterMinutes: 60 }), baseContext());
    expect(hasAction(result, "SLEEP")).toBe(true);
    expect(hasAction(result, "SCHEDULE_CLOSE")).toBe(false);
  });

  it("8. locked tab never enters pending closure", () => {
    const tab = inactiveTab(200, { closeLocked: true });
    const result = evaluateTab(tab, enabledSettings({ closeAfterMinutes: 120 }), baseContext());
    expect(hasAction(result, "SCHEDULE_CLOSE")).toBe(false);
    expect(hasAction(result, "CLOSE")).toBe(false);
  });

  it("9. unlocked tab enters pending closure after close threshold", () => {
    const tab = inactiveTab(130);
    const settings = enabledSettings({ closeAfterMinutes: 120, closeGraceMinutes: 10 });
    const result = evaluateTab(tab, settings, baseContext());
    expect(result.actions).toEqual(["SCHEDULE_CLOSE"]);
    expect(result.pendingCloseAt).toBe(BASE_NOW + 10 * MINUTE);
  });

  it("10. pending tab closes after grace period", () => {
    const tab = inactiveTab(200, {
      pendingCloseAt: BASE_NOW - MINUTE,
      pendingCloseScheduledAt: BASE_NOW - 11 * MINUTE,
    });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(result.actions).toEqual(["CLOSE"]);
  });

  it("11. activating a pending tab cancels closure", () => {
    const tab = inactiveTab(200, {
      active: true,
      pendingCloseAt: BASE_NOW + 5 * MINUTE,
    });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(result.actions).toEqual(["CANCEL_CLOSE"]);
  });

  it("12. locking a pending tab cancels closure", () => {
    const tab = inactiveTab(200, {
      closeLocked: true,
      pendingCloseAt: BASE_NOW + 5 * MINUTE,
    });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(hasAction(result, "CANCEL_CLOSE")).toBe(true);
    expect(hasAction(result, "CLOSE")).toBe(false);
  });

  it("13. pausing automation cancels closure", () => {
    const tab = inactiveTab(200, { pendingCloseAt: BASE_NOW + 5 * MINUTE });
    const result = evaluateTab(
      tab,
      enabledSettings({ automationPaused: true }),
      baseContext(),
    );
    expect(result.actions).toEqual(["CANCEL_CLOSE"]);
  });

  it("14. unavailable tab receives no lifecycle action", () => {
    const tab = inactiveTab(200, {
      canDiscard: false,
      canClose: false,
      unavailableReason: "PRIVILEGED_PAGE",
    });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(result.actions).toEqual(["NONE"]);
  });

  it("15. a tab is not repeatedly scheduled for closure", () => {
    const tab = inactiveTab(200, {
      pendingCloseAt: BASE_NOW + 8 * MINUTE,
      pendingCloseScheduledAt: BASE_NOW - 2 * MINUTE,
    });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(hasAction(result, "SCHEDULE_CLOSE")).toBe(false);
    expect(result.actions).toEqual(["NONE"]);
  });

  it("16. a sleeping tab can still enter pending closure", () => {
    const tab = inactiveTab(130, { discarded: true });
    const result = evaluateTab(
      tab,
      enabledSettings({ closeAfterMinutes: 120 }),
      baseContext(),
    );
    expect(hasAction(result, "SCHEDULE_CLOSE")).toBe(true);
    expect(hasAction(result, "SLEEP")).toBe(false);
  });
});

describe("evaluateTab — M2 safety rails", () => {
  it("onboarding not completed produces no automatic action", () => {
    const tab = inactiveTab(200);
    const result = evaluateTab(
      tab,
      enabledSettings({ onboardingCompleted: false }),
      baseContext(),
    );
    expect(result.actions).toEqual(["NONE"]);
  });

  it("never-activated tab is not closed before 14 days", () => {
    const tab = inactiveTab(7 * 24 * 60, {
      neverActivated: true,
      firstObservedAt: BASE_NOW - 7 * DAY,
    });
    const result = evaluateTab(
      tab,
      enabledSettings({ closeAfterMinutes: 60 }),
      baseContext(),
    );
    expect(hasAction(result, "SCHEDULE_CLOSE")).toBe(false);
    expect(hasAction(result, "CLOSE")).toBe(false);
  });

  it("tab younger than 24 h is never closed", () => {
    const tab = inactiveTab(300, { firstObservedAt: BASE_NOW - 12 * HOUR });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(hasAction(result, "SCHEDULE_CLOSE")).toBe(false);
    expect(hasAction(result, "CLOSE")).toBe(false);
    expect(result.skipReason).toBeUndefined();
  });

  it("settling period suppresses closures for 30 minutes after startup", () => {
    const tab = inactiveTab(300);
    const result = evaluateTab(
      tab,
      enabledSettings(),
      baseContext({ browserStartedAt: BASE_NOW - 10 * MINUTE }),
    );
    expect(hasAction(result, "SCHEDULE_CLOSE")).toBe(false);
  });

  it("per-sweep closure cap defers close", () => {
    const tab = inactiveTab(200, { pendingCloseAt: BASE_NOW - MINUTE });
    const result = evaluateTab(
      tab,
      enabledSettings(),
      baseContext({ closuresThisSweep: SWEEP_LIMITS.maxClosuresPerSweep }),
    );
    expect(hasAction(result, "CLOSE")).toBe(false);
    expect(result.skipReason).toBe("Deferred (rate limit)");
  });

  it("per-hour closure cap defers close", () => {
    const tab = inactiveTab(200, { pendingCloseAt: BASE_NOW - MINUTE });
    const result = evaluateTab(
      tab,
      enabledSettings(),
      baseContext({ closuresThisHour: SWEEP_LIMITS.maxClosuresPerHour }),
    );
    expect(hasAction(result, "CLOSE")).toBe(false);
    expect(result.skipReason).toBe("Deferred (rate limit)");
  });

  it("per-sweep discard cap defers sleep", () => {
    const tab = inactiveTab(90);
    const result = evaluateTab(
      tab,
      enabledSettings({ sleepAfterMinutes: 60 }),
      baseContext({ discardsThisSweep: SWEEP_LIMITS.maxDiscardsPerSweep }),
    );
    expect(hasAction(result, "SLEEP")).toBe(false);
    expect(result.skipReason).toBe("Deferred (rate limit)");
  });

  it("never-close host rule blocks closing but allows sleeping", () => {
    const tab = inactiveTab(200, { url: "https://protected.example.com/page" });
    const settings = enabledSettings({
      neverCloseHosts: ["protected.example.com"],
      neverSleepHosts: [],
      sleepAfterMinutes: 60,
    });
    const closeResult = evaluateTab(tab, settings, baseContext());
    expect(hasAction(closeResult, "SCHEDULE_CLOSE")).toBe(false);

    const sleepTab = inactiveTab(90, { url: "https://protected.example.com/page" });
    const sleepResult = evaluateTab(sleepTab, settings, baseContext());
    expect(hasAction(sleepResult, "SLEEP")).toBe(true);
  });

  it("never-sleep host rule blocks sleeping but allows closing", () => {
    const tab = inactiveTab(130, { url: "https://docs.google.com/doc" });
    const settings = enabledSettings({
      neverSleepHosts: ["docs.google.com"],
      closeAfterMinutes: 120,
    });
    const sleepResult = evaluateTab(tab, settings, baseContext());
    expect(hasAction(sleepResult, "SLEEP")).toBe(false);

    const closeTab = inactiveTab(130, { url: "https://docs.google.com/doc" });
    const closeResult = evaluateTab(closeTab, settings, baseContext());
    expect(hasAction(closeResult, "SCHEDULE_CLOSE")).toBe(true);
  });

  it("keepLoaded blocks sleeping but not closing", () => {
    const tab = inactiveTab(90, { keepLoaded: true });
    const sleepResult = evaluateTab(
      tab,
      enabledSettings({ sleepAfterMinutes: 60 }),
      baseContext(),
    );
    expect(hasAction(sleepResult, "SLEEP")).toBe(false);

    const closeTab = inactiveTab(130, { keepLoaded: true });
    const closeResult = evaluateTab(
      closeTab,
      enabledSettings({ closeAfterMinutes: 120 }),
      baseContext(),
    );
    expect(hasAction(closeResult, "SCHEDULE_CLOSE")).toBe(true);
  });

  it("snooze blocks both sleep and close until it expires", () => {
    const tab = inactiveTab(200, { snoozedUntil: BASE_NOW + HOUR });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(result.actions).toEqual(["NONE"]);
    expect(result.skipReason).toBe("Snoozed");
  });

  it("report-only mode never closes", () => {
    const tab = inactiveTab(200, { pendingCloseAt: BASE_NOW - MINUTE });
    const result = evaluateTab(
      tab,
      enabledSettings(),
      baseContext({ reportOnlyClosing: true }),
    );
    expect(hasAction(result, "CLOSE")).toBe(false);
    expect(result.wouldClose).toBe(true);
  });

  it("report-only mode records would-close when scheduling", () => {
    const tab = inactiveTab(130);
    const result = evaluateTab(
      tab,
      enabledSettings({ closeAfterMinutes: 120 }),
      baseContext({ reportOnlyClosing: true }),
    );
    expect(hasAction(result, "SCHEDULE_CLOSE")).toBe(false);
    expect(result.wouldClose).toBe(true);
  });

  it("no CLOSE in the same evaluation as first SCHEDULE_CLOSE", () => {
    const tab = inactiveTab(200);
    const result = evaluateTab(
      tab,
      enabledSettings({ closeAfterMinutes: 120, closeGraceMinutes: 0 }),
      baseContext(),
    );
    expect(hasAction(result, "SCHEDULE_CLOSE")).toBe(true);
    expect(hasAction(result, "CLOSE")).toBe(false);
  });

  it("negative or jumped clock cannot produce closure from inactiveMs", () => {
    const tab = makeTab({
      lastActivatedAt: BASE_NOW + HOUR,
      inactivityCreditMs: 0,
    });
    const result = evaluateTab(tab, enabledSettings(), baseContext());
    expect(hasAction(result, "SCHEDULE_CLOSE")).toBe(false);
    expect(hasAction(result, "CLOSE")).toBe(false);
  });
});

describe("reanchorPendingClose", () => {
  it("never shortens a running grace period", () => {
    const scheduledAt = BASE_NOW - 5 * MINUTE;
    const existingCloseAt = BASE_NOW + 20 * MINUTE;
    const next = reanchorPendingClose(
      { pendingCloseScheduledAt: scheduledAt, pendingCloseAt: existingCloseAt },
      10,
      BASE_NOW,
    );
    expect(next).toBe(existingCloseAt);
  });

  it("extends grace when the new setting is longer", () => {
    const scheduledAt = BASE_NOW - 5 * MINUTE;
    const existingCloseAt = BASE_NOW + 2 * MINUTE;
    const next = reanchorPendingClose(
      { pendingCloseScheduledAt: scheduledAt, pendingCloseAt: existingCloseAt },
      30,
      BASE_NOW,
    );
    expect(next).toBeGreaterThanOrEqual(scheduledAt + 30 * MINUTE);
  });
});

describe("TAB_MIN_AGE_CLOSE_MS constant", () => {
  it("is 24 hours", () => {
    expect(TAB_MIN_AGE_CLOSE_MS).toBe(24 * HOUR);
  });
});
