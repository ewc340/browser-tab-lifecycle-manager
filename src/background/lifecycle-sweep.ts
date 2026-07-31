/**
 * Periodic lifecycle sweep: evaluate, patch records, execute discards/closes.
 */
import type { ManagedTabRecord } from "../shared/types.ts";
import { evaluateTab, type EvaluationContext } from "../shared/lifecycle.ts";
import { DEV_FAST_LIFECYCLE } from "../shared/defaults.ts";
import { ExtensionError } from "../shared/errors.ts";
import {
  applyEvaluationPatch,
  shouldExecuteClose,
  shouldExecuteSleep,
  shouldRecordWouldClose,
} from "./lifecycle-engine.ts";
import {
  getRecords,
  putRecords,
  purgeTombstones,
  reconcileFromBrowser,
} from "./tab-repository.ts";
import { loadSettings, saveSettings } from "./settings-service.ts";
import { loadRuntimeState, saveRuntimeState } from "./runtime-state-service.ts";
import { applyLocksToRecords } from "./lock-service.ts";
import { applyLedgerToRecords } from "./activity-ledger.ts";
import { executeCloseWithRecovery } from "../shared/recovery-close-flow.ts";
import { appendActivityEvent, appendAggregateEvent, tabSnapshotFromRecord } from "./activity-service.ts";
import { createRecoveryRecord, patchRecoveryActivityId } from "./recovery-service.ts";
import { updateBadge } from "./badge-service.ts";
import {
  getSession,
  setSession,
  SESSION_KEY_CLOSING_TAB_IDS,
  SESSION_KEY_SWEEP_COUNTERS,
  SESSION_KEY_SWEEP_LEASE,
} from "./storage.ts";
import { broadcast } from "./messaging.ts";
import * as log from "../shared/log.ts";

const LEASE_STALE_MS = 60_000;
const CHUNK_SIZE = 10;
const CHUNK_YIELD_MS = 50;

export interface SweepSummary {
  slept: number;
  scheduled: number;
  closed: number;
  wouldClose: number;
  cancelled: number;
}

interface SweepLease {
  id: string;
  startedAt: number;
}

interface SweepCounters {
  hourBucket: number;
  closures: number;
}

function newLeaseId(): string {
  return crypto.randomUUID();
}

async function readLease(): Promise<SweepLease | null> {
  return getSession<SweepLease | null>(SESSION_KEY_SWEEP_LEASE, null);
}

async function tryAcquireLease(now: number): Promise<string | null> {
  const existing = await readLease();
  if (existing !== null && now - existing.startedAt < LEASE_STALE_MS) {
    return null;
  }
  const lease: SweepLease = { id: newLeaseId(), startedAt: now };
  await setSession({ [SESSION_KEY_SWEEP_LEASE]: lease });
  return lease.id;
}

async function releaseLease(leaseId: string): Promise<void> {
  const existing = await readLease();
  if (existing?.id === leaseId) {
    await setSession({ [SESSION_KEY_SWEEP_LEASE]: null });
  }
}

async function readCounters(now: number): Promise<SweepCounters> {
  const counters = await getSession<SweepCounters>(SESSION_KEY_SWEEP_COUNTERS, {
    hourBucket: 0,
    closures: 0,
  });
  const hourBucket = Math.floor(now / (60 * 60 * 1000));
  if (counters.hourBucket !== hourBucket) {
    return { hourBucket, closures: 0 };
  }
  return counters;
}

async function writeCounters(counters: SweepCounters): Promise<void> {
  await setSession({ [SESSION_KEY_SWEEP_COUNTERS]: counters });
}

function effectiveSettings(settings: Awaited<ReturnType<typeof loadSettings>>) {
  if (!import.meta.env.DEV) return settings;
  if (!settings.onboardingCompleted) return settings;
  return {
    ...settings,
    ...DEV_FAST_LIFECYCLE,
  };
}

async function revalidateTabForDestructive(
  tabId: number,
  record: ManagedTabRecord,
): Promise<ManagedTabRecord | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const windows = await chrome.windows.get(tab.windowId);
    const windowType = windows.type ?? "unknown";

    if (tab.active || tab.pinned || tab.audible) return null;
    if (windowType !== "normal" || tab.incognito) return null;

    const fresh = { ...record };
    fresh.active = tab.active;
    fresh.pinned = tab.pinned;
    fresh.audible = tab.audible ?? false;
    fresh.discarded = tab.discarded;
    fresh.url = tab.url ?? fresh.url;
    return fresh;
  } catch {
    return null;
  }
}

async function sleepTab(tabId: number): Promise<boolean> {
  try {
    const result = await chrome.tabs.discard(tabId);
    return result !== undefined && result.discarded === true;
  } catch {
    return false;
  }
}

async function closeTabManaged(
  record: ManagedTabRecord,
  reason: string,
): Promise<boolean> {
  const closingIds = await getSession<number[]>(SESSION_KEY_CLOSING_TAB_IDS, []);
  await setSession({ [SESSION_KEY_CLOSING_TAB_IDS]: [...closingIds, record.tabId] });

  try {
    await executeCloseWithRecovery({
      createRecovery: async () => {
        const recovery = await createRecoveryRecord(
          record,
          reason,
          record.pendingCloseRuleMinutes ?? 0,
        );
        if (recovery === null) {
          throw new ExtensionError("STORAGE_WRITE_FAILED", "Could not create recovery record");
        }
        return { id: recovery.id };
      },
      removeTab: async () => {
        await chrome.tabs.remove(record.tabId);
      },
      appendActivity: async (recoveryId) => {
        const event = await appendActivityEvent({
          type: "TAB_CLOSED",
          source: "AUTOMATIC_CLOSE",
          message: `Closed "${record.title}"`,
          tabs: [tabSnapshotFromRecord(record)],
          reason,
          reversible: true,
          relatedRecoveryIds: [recoveryId],
        });
        return { id: event.id };
      },
      linkActivity: async (recoveryId, activityEventId) => {
        await patchRecoveryActivityId(recoveryId, activityEventId);
      },
    });
    return true;
  } catch (e) {
    log.warn("closeTabManaged failed", record.tabId, e);
    return false;
  } finally {
    const ids = await getSession<number[]>(SESSION_KEY_CLOSING_TAB_IDS, []);
    await setSession({
      [SESSION_KEY_CLOSING_TAB_IDS]: ids.filter((id) => id !== record.tabId),
    });
  }
}

function countPending(records: Map<number, ManagedTabRecord>, now: number): number {
  let count = 0;
  for (const record of records.values()) {
    if (record.removedAt !== undefined) continue;
    if (record.pendingCloseAt !== undefined && record.pendingCloseAt > now) count++;
  }
  return count;
}

export async function runLifecycleSweep(options?: {
  trigger?: string;
}): Promise<SweepSummary> {
  const now = Date.now();
  const leaseId = await tryAcquireLease(now);
  if (leaseId === null) {
    log.debug("sweep skipped — lease held");
    return { slept: 0, scheduled: 0, closed: 0, wouldClose: 0, cancelled: 0 };
  }

  const summary: SweepSummary = {
    slept: 0,
    scheduled: 0,
    closed: 0,
    wouldClose: 0,
    cancelled: 0,
  };

  try {
    const [settings, runtime] = await Promise.all([loadSettings(), loadRuntimeState()]);
    const effective = effectiveSettings(settings);
    let counters = await readCounters(now);

    const records = await reconcileFromBrowser(now);
    await applyLedgerToRecords(records);
    await applyLocksToRecords(records);

    const reportOnlyClosing =
      runtime.reportOnlyUntil > now && effective.autoCloseEnabled;

    let closuresThisSweep = 0;
    let discardsThisSweep = 0;

    const sleepTargets: ManagedTabRecord[] = [];
    const closeTargets: ManagedTabRecord[] = [];
    const wouldCloseSnapshots: ManagedTabRecord[] = [];

    // ── Evaluate and patch records ──────────────────────────────────────────
    for (const [tabId, record] of records) {
      if (record.removedAt !== undefined) continue;

      const ctx: EvaluationContext = {
        now,
        browserStartedAt: runtime.browserStartedAt,
        lastSweepCompletedAt: runtime.lastSweepCompletedAt,
        closuresThisSweep,
        closuresThisHour: counters.closures,
        discardsThisSweep,
        reportOnlyClosing,
      };

      const result = evaluateTab(record, effective, ctx);
      const patched = applyEvaluationPatch(record, result, effective, now);
      records.set(tabId, patched);

      if (result.actions.includes("CANCEL_CLOSE") && record.pendingCloseAt !== undefined) {
        summary.cancelled++;
      }

      if (shouldRecordWouldClose(result)) {
        summary.wouldClose++;
        wouldCloseSnapshots.push(record);
      }

      if (shouldExecuteSleep(result)) {
        sleepTargets.push(patched);
        discardsThisSweep++;
      } else if (result.actions.includes("SCHEDULE_CLOSE")) {
        summary.scheduled++;
      } else if (shouldExecuteClose(result)) {
        closeTargets.push(patched);
        closuresThisSweep++;
      }
    }

    await putRecords(records);

    // ── Execute sleeps in chunks ────────────────────────────────────────────
    const sleptTabs: ManagedTabRecord[] = [];
    for (let i = 0; i < sleepTargets.length; i += CHUNK_SIZE) {
      const chunk = sleepTargets.slice(i, i + CHUNK_SIZE);
      for (const record of chunk) {
        const fresh = await revalidateTabForDestructive(record.tabId, record);
        if (fresh === null) continue;
        const ok = await sleepTab(record.tabId);
        if (ok) {
          summary.slept++;
          sleptTabs.push(record);
          const map = await getRecords();
          const existing = map.get(record.tabId);
          if (existing !== undefined) {
            map.set(record.tabId, { ...existing, discarded: true, discardedBy: "EXTENSION" });
            await putRecords(map);
          }
        }
      }
      if (i + CHUNK_SIZE < sleepTargets.length) {
        await new Promise((r) => setTimeout(r, CHUNK_YIELD_MS));
      }
    }

    if (sleptTabs.length > 0) {
      await appendAggregateEvent(
        "TABS_SLEPT",
        "AUTOMATIC_SLEEP",
        `Put ${sleptTabs.length} tab(s) to sleep`,
        sleptTabs.map(tabSnapshotFromRecord),
        `Inactive for at least ${effective.sleepAfterMinutes} minutes`,
      );
    }

    // ── Execute closes in chunks ────────────────────────────────────────────
    for (let i = 0; i < closeTargets.length; i += CHUNK_SIZE) {
      const chunk = closeTargets.slice(i, i + CHUNK_SIZE);
      for (const record of chunk) {
        const fresh = await revalidateTabForDestructive(record.tabId, record);
        if (fresh === null || fresh.closeLocked) continue;
        const ok = await closeTabManaged(fresh, record.pendingCloseReason ?? "Automatic closure");
        if (ok) {
          summary.closed++;
          counters = { ...counters, closures: counters.closures + 1 };
        }
      }
      if (i + CHUNK_SIZE < closeTargets.length) {
        await new Promise((r) => setTimeout(r, CHUNK_YIELD_MS));
      }
    }

    if (wouldCloseSnapshots.length > 0 && reportOnlyClosing) {
      await appendAggregateEvent(
        "TAB_WOULD_CLOSE",
        "AUTOMATIC_REPORT_ONLY",
        `Report-only: would have closed ${wouldCloseSnapshots.length} tab(s)`,
        wouldCloseSnapshots.map(tabSnapshotFromRecord),
      );
    }

    runtime.lastSweepCompletedAt = now;
    await saveRuntimeState(runtime);
    await writeCounters(counters);
    await purgeTombstones(now - 60_000);

    const pendingCloseCount = countPending(await getRecords(), now);
    await updateBadge({
      pendingCloseCount,
      automationPaused: settings.automationPaused,
    });

    broadcast({
      type: "SWEEP_COMPLETED",
      slept: summary.slept,
      closed: summary.closed,
      scheduled: summary.scheduled,
    });
    broadcast({ type: "APP_STATE_CHANGED" });

    log.info("sweep complete", options?.trigger ?? "manual", summary);
    return summary;
  } catch (e) {
    if (e instanceof ExtensionError && e.code === "STORAGE_QUOTA_EXCEEDED") {
      const settings = await loadSettings();
      await saveSettings({ ...settings, automationPaused: true });
    }
    throw e;
  } finally {
    await releaseLease(leaseId);
  }
}

export async function cancelPendingCloseForTabs(tabIds: readonly number[]): Promise<number> {
  const records = await getRecords();
  let changed = 0;
  for (const tabId of tabIds) {
    const record = records.get(tabId);
    if (record === undefined || record.pendingCloseAt === undefined) continue;
    records.set(tabId, {
      ...record,
      pendingCloseAt: undefined,
      pendingCloseScheduledAt: undefined,
      pendingCloseReason: undefined,
      pendingCloseRuleMinutes: undefined,
    });
    changed++;
  }
  if (changed > 0) await putRecords(records);
  return changed;
}

export async function cancelAllPendingClosuresInStorage(): Promise<number> {
  const records = await getRecords();
  let changed = 0;
  for (const [tabId, record] of records) {
    if (record.pendingCloseAt === undefined) continue;
    records.set(tabId, {
      ...record,
      pendingCloseAt: undefined,
      pendingCloseScheduledAt: undefined,
      pendingCloseReason: undefined,
      pendingCloseRuleMinutes: undefined,
    });
    changed++;
  }
  if (changed > 0) await putRecords(records);
  return changed;
}

export async function pauseAutomation(): Promise<void> {
  const settings = await loadSettings();
  await saveSettings({ ...settings, automationPaused: true });
  await cancelAllPendingClosuresInStorage();
  await runLifecycleSweep({ trigger: "pause" });
}

export async function resumeAutomation(): Promise<{ pendingCloseCount: number }> {
  const settings = await loadSettings();
  await saveSettings({ ...settings, automationPaused: false });
  await runLifecycleSweep({ trigger: "resume" });
  const records = await getRecords();
  return { pendingCloseCount: countPending(records, Date.now()) };
}
