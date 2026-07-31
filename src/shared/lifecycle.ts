/**
 * Pure lifecycle evaluator — single source of truth for automatic tab actions.
 *
 * No chrome.* calls; `now` and sweep counters are injected via EvaluationContext.
 */
import type { ExtensionSettings, ManagedTabRecord } from "./types.ts";
import { computeInactiveMs, hostMatches, isUnavailable } from "./eligibility.ts";
import { DAY, HOUR, MINUTE, minutesToMs } from "./time.ts";

export type LifecycleAction =
  | "NONE"
  | "SLEEP"
  | "SCHEDULE_CLOSE"
  | "CANCEL_CLOSE"
  | "CLOSE";

export interface EvaluationResult {
  actions: LifecycleAction[];
  reason: string;
  pendingCloseAt?: number;
  skipReason?: string;
  /** Set when report-only mode would have closed the tab. */
  wouldClose?: boolean;
}

export interface EvaluationContext {
  now: number;
  browserStartedAt: number;
  lastSweepCompletedAt: number;
  closuresThisSweep: number;
  closuresThisHour: number;
  discardsThisSweep: number;
  reportOnlyClosing: boolean;
}

export const NEVER_ACTIVATED_MIN_CLOSE_MS = 14 * DAY;
export const TAB_MIN_AGE_CLOSE_MS = 24 * HOUR;
export const SETTLING_PERIOD_MS = 30 * MINUTE;
export const DOWNTIME_CREDIT_THRESHOLD_MS = 12 * HOUR;

export const SWEEP_LIMITS = {
  maxClosuresPerSweep: 10,
  maxClosuresPerHour: 25,
  maxDiscardsPerSweep: 50,
} as const;

const CANCEL = "CANCEL_CLOSE" as const;
const NONE = "NONE" as const;

function cancelPendingOrNone(skipReason?: string): EvaluationResult {
  const result: EvaluationResult = {
    actions: [CANCEL],
    reason: skipReason ?? "Conditions no longer allow automatic closure",
  };
  if (skipReason !== undefined) result.skipReason = skipReason;
  return result;
}

function none(reason: string, skipReason?: string): EvaluationResult {
  const result: EvaluationResult = { actions: [NONE], reason };
  if (skipReason !== undefined) result.skipReason = skipReason;
  return result;
}

function isSleepBlocked(
  tab: ManagedTabRecord,
  settings: ExtensionSettings,
): boolean {
  if (hostMatches(tab.url, settings.neverSleepHosts)) return true;
  if (tab.keepLoaded) return true;
  if (tab.closeLocked && settings.lockImpliesKeepLoaded) return true;
  return false;
}

function isCloseBlocked(
  tab: ManagedTabRecord,
  settings: ExtensionSettings,
  ctx: EvaluationContext,
): string | undefined {
  if (hostMatches(tab.url, settings.neverCloseHosts)) return "Never closes: host rule";
  if (ctx.now - tab.firstObservedAt < TAB_MIN_AGE_CLOSE_MS) return "Tab younger than 24 hours";
  if (ctx.now - ctx.browserStartedAt < SETTLING_PERIOD_MS) return "Settling period";
  return undefined;
}

function effectiveCloseAfterMs(tab: ManagedTabRecord, settings: ExtensionSettings): number {
  const base = minutesToMs(settings.closeAfterMinutes);
  if (tab.neverActivated) {
    return Math.max(base, NEVER_ACTIVATED_MIN_CLOSE_MS);
  }
  return base;
}

function closureRateLimited(ctx: EvaluationContext): boolean {
  return (
    ctx.closuresThisSweep >= SWEEP_LIMITS.maxClosuresPerSweep ||
    ctx.closuresThisHour >= SWEEP_LIMITS.maxClosuresPerHour
  );
}

/**
 * Evaluates one tab and returns the actions the sweep should apply.
 * Evaluation order matches docs/IMPLEMENTATION_PLAN.md §3.4.
 */
export function evaluateTab(
  tab: ManagedTabRecord,
  settings: ExtensionSettings,
  ctx: EvaluationContext,
): EvaluationResult {
  const { now } = ctx;

  // 1–2: automation gates
  if (!settings.onboardingCompleted) {
    if (tab.pendingCloseAt !== undefined) {
      return cancelPendingOrNone("Onboarding not completed");
    }
    return none("Onboarding not completed");
  }

  if (settings.automationPaused) {
    if (tab.pendingCloseAt !== undefined) {
      return cancelPendingOrNone("Automation paused");
    }
    return none("Automation paused");
  }

  // 3: unavailable / incognito / non-normal (encoded in canDiscard/canClose)
  if (isUnavailable(tab) || tab.incognito) {
    if (tab.pendingCloseAt !== undefined) {
      return cancelPendingOrNone(tab.unavailableReason ?? "Unavailable");
    }
    return none("Unavailable tab", tab.unavailableReason);
  }

  // 4–5: active, pinned, audible
  if (tab.active) {
    if (tab.pendingCloseAt !== undefined) {
      return cancelPendingOrNone("Tab is active");
    }
    return none("Tab is active");
  }

  if (tab.pinned) {
    if (tab.pendingCloseAt !== undefined) {
      return cancelPendingOrNone("Tab is pinned");
    }
    return none("Tab is pinned");
  }

  if (tab.audible) {
    if (tab.pendingCloseAt !== undefined) {
      return cancelPendingOrNone("Tab is audible");
    }
    return none("Tab is audible");
  }

  // 6: snooze
  if (tab.snoozedUntil !== undefined && now < tab.snoozedUntil) {
    if (tab.pendingCloseAt !== undefined) {
      return cancelPendingOrNone("Snoozed");
    }
    return none("Snoozed", "Snoozed");
  }

  const inactiveMs = computeInactiveMs(tab, now);
  const closeBlockedReason = isCloseBlocked(tab, settings, ctx);
  const sleepBlocked = isSleepBlocked(tab, settings);

  // 13: locked — cancel pending close, may still sleep
  if (tab.closeLocked) {
    const actions: LifecycleAction[] = [];
    if (tab.pendingCloseAt !== undefined) {
      actions.push(CANCEL);
    }

    if (
      settings.sleepEnabled &&
      !sleepBlocked &&
      !tab.discarded &&
      tab.canDiscard &&
      inactiveMs >= minutesToMs(settings.sleepAfterMinutes) &&
      ctx.discardsThisSweep < SWEEP_LIMITS.maxDiscardsPerSweep
    ) {
      actions.push("SLEEP");
      return {
        actions: actions.length > 0 ? actions : [NONE],
        reason: `Inactive for ${Math.floor(inactiveMs / MINUTE)} minutes — sleep threshold reached`,
      };
    }

    if (actions.length > 0) {
      return { actions, reason: "Locked tab — pending closure cancelled" };
    }
    return none("Locked tab");
  }

  // 14: close path
  if (settings.autoCloseEnabled && tab.canClose && closeBlockedReason === undefined) {
    const closeAfterMs = effectiveCloseAfterMs(tab, settings);
    const graceMs = minutesToMs(settings.closeGraceMinutes);

    if (tab.pendingCloseAt !== undefined && now >= tab.pendingCloseAt) {
      if (closureRateLimited(ctx)) {
        return none("Closure deferred (rate limit)", "Deferred (rate limit)");
      }
      if (ctx.reportOnlyClosing) {
        return {
          actions: [NONE],
          reason: "Report-only: would close tab",
          wouldClose: true,
        };
      }
      return {
        actions: ["CLOSE"],
        reason: `Grace period ended after ${settings.closeGraceMinutes} minutes`,
      };
    }

    if (inactiveMs >= closeAfterMs) {
      if (tab.pendingCloseAt !== undefined) {
        // Already pending — wait for grace; do not re-schedule
        return none("Awaiting close grace period");
      }

      const pendingCloseAt = now + graceMs;
      if (ctx.reportOnlyClosing) {
        return {
          actions: [NONE],
          reason: "Report-only: would schedule closure",
          wouldClose: true,
          pendingCloseAt,
        };
      }
      return {
        actions: ["SCHEDULE_CLOSE"],
        reason: `Inactive for ${Math.floor(inactiveMs / MINUTE)} minutes — close threshold reached`,
        pendingCloseAt,
      };
    }

    if (tab.pendingCloseAt !== undefined && inactiveMs < closeAfterMs) {
      return cancelPendingOrNone("Activity reset closure timer");
    }
  } else if (tab.pendingCloseAt !== undefined) {
    return cancelPendingOrNone(closeBlockedReason ?? "Close no longer eligible");
  }

  // 15: sleep path
  if (
    settings.sleepEnabled &&
    !sleepBlocked &&
    !tab.discarded &&
    tab.canDiscard &&
    inactiveMs >= minutesToMs(settings.sleepAfterMinutes) &&
    ctx.discardsThisSweep < SWEEP_LIMITS.maxDiscardsPerSweep
  ) {
    return {
      actions: ["SLEEP"],
      reason: `Inactive for ${Math.floor(inactiveMs / MINUTE)} minutes — sleep threshold reached`,
    };
  }

  if (
    settings.sleepEnabled &&
    !sleepBlocked &&
    !tab.discarded &&
    tab.canDiscard &&
    inactiveMs >= minutesToMs(settings.sleepAfterMinutes) &&
    ctx.discardsThisSweep >= SWEEP_LIMITS.maxDiscardsPerSweep
  ) {
    return none("Sleep deferred (rate limit)", "Deferred (rate limit)");
  }

  return none("No lifecycle threshold reached");
}

/**
 * Credits browser-closed downtime so it does not count as tab inactivity.
 * Called during startup reconciliation when the gap since last sweep exceeds 12 h.
 */
export function computeDowntimeCreditMs(
  lastSweepCompletedAt: number,
  now: number,
): number {
  if (lastSweepCompletedAt <= 0) return 0;
  const gap = now - lastSweepCompletedAt;
  if (gap <= DOWNTIME_CREDIT_THRESHOLD_MS) return 0;
  return gap;
}

/**
 * Re-anchors pending closures when closeGraceMinutes changes. Never shortens grace.
 */
export function reanchorPendingClose(
  tab: Pick<ManagedTabRecord, "pendingCloseAt" | "pendingCloseScheduledAt">,
  newGraceMinutes: number,
  now: number,
): number | undefined {
  if (tab.pendingCloseScheduledAt === undefined) return tab.pendingCloseAt;
  const newGraceMs = minutesToMs(newGraceMinutes);
  const fromSchedule = tab.pendingCloseScheduledAt + newGraceMs;
  const existing = tab.pendingCloseAt ?? fromSchedule;
  return Math.max(existing, fromSchedule, now);
}

/** Human-readable skip reason for the panel (computed on demand, never stored). */
export function computeSkipReason(
  tab: ManagedTabRecord,
  settings: ExtensionSettings,
  ctx: Pick<EvaluationContext, "now" | "browserStartedAt">,
): string | undefined {
  const result = evaluateTab(tab, settings, {
    ...ctx,
    lastSweepCompletedAt: 0,
    closuresThisSweep: 0,
    closuresThisHour: 0,
    discardsThisSweep: 0,
    reportOnlyClosing: false,
  });
  return result.skipReason;
}
