/**
 * Startup and update reconciliation (PRD FR-011 + M2 additions).
 */
import type { ManagedTabRecord } from "../shared/types.ts";
import { computeDowntimeCreditMs } from "../shared/lifecycle.ts";
import { ONBOARDING_ENABLED_SETTINGS, DEV_FAST_LIFECYCLE } from "../shared/defaults.ts";
import { applyLocksToRecords } from "./lock-service.ts";
import { applyLedgerToRecords } from "./activity-ledger.ts";
import { reconcileFromBrowser } from "./tab-repository.ts";
import { updateSettings } from "./settings-service.ts";
import { loadRuntimeState, saveRuntimeState } from "./runtime-state-service.ts";
import { ensureLifecycleAlarm } from "./alarm-service.ts";
import { runRetentionMaintenance } from "./maintenance-service.ts";
import { appendActivityEvent } from "./activity-service.ts";
import { runLifecycleSweep } from "./lifecycle-sweep.ts";
import * as log from "../shared/log.ts";

export function applyDowntimeCredit(
  records: Map<number, ManagedTabRecord>,
  lastSweepCompletedAt: number,
  now: number,
): void {
  const credit = computeDowntimeCreditMs(lastSweepCompletedAt, now);
  if (credit <= 0) return;

  for (const [tabId, record] of records) {
    records.set(tabId, {
      ...record,
      inactivityCreditMs: record.inactivityCreditMs + credit,
    });
  }
  log.info("applied downtime credit ms", credit, "to", records.size, "tabs");
}

export function cancelAllPendingClosures(
  records: Map<number, ManagedTabRecord>,
): number {
  let cancelled = 0;
  for (const [tabId, record] of records) {
    if (record.pendingCloseAt === undefined) continue;
    records.set(tabId, {
      ...record,
      pendingCloseAt: undefined,
      pendingCloseScheduledAt: undefined,
      pendingCloseReason: undefined,
      pendingCloseRuleMinutes: undefined,
    });
    cancelled++;
  }
  return cancelled;
}

/**
 * Full reconciliation pipeline. Idempotent: a second call with unchanged browser
 * state should not mutate records further.
 */
export async function runReconciliation(now: number): Promise<void> {
  const runtime = await loadRuntimeState();

  const records = await reconcileFromBrowser(now);
  applyDowntimeCredit(records, runtime.lastSweepCompletedAt, now);
  await applyLedgerToRecords(records);
  await applyLocksToRecords(records);

  const { putRecords } = await import("./tab-repository.ts");
  await putRecords(records);

  await runRetentionMaintenance(now);
  await runLifecycleSweep({ trigger: "reconciliation" });
}

export async function handleExtensionInstall(reason: chrome.runtime.InstalledDetails["reason"]): Promise<void> {
  const now = Date.now();
  const { version } = chrome.runtime.getManifest();
  const runtime = await loadRuntimeState();
  const previousVersion = runtime.lastKnownVersion;

  runtime.browserStartedAt = now;
  runtime.lastKnownVersion = version;

  if (reason === "update") {
    const records = await reconcileFromBrowser(now);
    const cancelled = cancelAllPendingClosures(records);
    const { putRecords } = await import("./tab-repository.ts");
    await putRecords(records);

    await appendActivityEvent({
      type: "MAINTENANCE",
      source: "SYSTEM",
      message: `Extension updated from ${previousVersion} to ${version}. ${cancelled} pending closure(s) were cancelled.`,
      tabs: [],
      reversible: false,
      metadata: { cancelledPending: cancelled },
    });

    runtime.whatsNewVersion = version;
  }

  await saveRuntimeState(runtime);
  await ensureLifecycleAlarm();
  await runReconciliation(now);
}

export async function handleBrowserStartup(): Promise<void> {
  const now = Date.now();
  const runtime = await loadRuntimeState();
  runtime.browserStartedAt = now;
  await saveRuntimeState(runtime);
  await ensureLifecycleAlarm();
  await runReconciliation(now);
}

export async function completeOnboarding(
  enableAutomation: boolean,
  reportOnlyDays: number,
): Promise<void> {
  const now = Date.now();
  const runtime = await loadRuntimeState();

  const patch = enableAutomation
    ? {
        ...ONBOARDING_ENABLED_SETTINGS,
        ...(import.meta.env.DEV ? DEV_FAST_LIFECYCLE : {}),
      }
    : { onboardingCompleted: true };

  await updateSettings(patch);

  runtime.reportOnlyUntil =
    reportOnlyDays > 0 ? now + reportOnlyDays * 24 * 60 * 60 * 1000 : 0;

  await saveRuntimeState(runtime);
  await runLifecycleSweep({ trigger: "onboarding" });
}
