/**
 * Recovery record storage, restore, and retention (Milestone 3).
 */
import type { ManagedTabRecord, RecoveryRecord } from "../shared/types.ts";
import { sanitizeTitle } from "../shared/sanitize.ts";
import { clampRestoreIndex, selectRestoreWindowId } from "../shared/recovery-restore.ts";
import { loadSettings } from "./settings-service.ts";
import { lockTabs } from "./lock-service.ts";
import { appendActivityEvent } from "./activity-service.ts";
import { getLocal, setLocal, LOCAL_KEY_RECOVERY_RECORDS } from "./storage.ts";
import { ExtensionError } from "../shared/errors.ts";

async function loadRecords(): Promise<RecoveryRecord[]> {
  return getLocal<RecoveryRecord[]>(LOCAL_KEY_RECOVERY_RECORDS, []);
}

async function saveRecords(records: RecoveryRecord[]): Promise<void> {
  const settings = await loadSettings();
  await setLocal({
    [LOCAL_KEY_RECOVERY_RECORDS]: records.slice(0, settings.maximumRecoveryRecords),
  });
}

export async function listRecoveryRecords(): Promise<RecoveryRecord[]> {
  const records = await loadRecords();
  await pruneExpiredRecords(records);
  return loadRecords();
}

export async function createRecoveryRecord(
  record: ManagedTabRecord,
  closeReason: string,
  closeRuleMinutes: number,
  activityEventId?: string,
): Promise<RecoveryRecord | null> {
  const settings = await loadSettings();
  const now = Date.now();
  const url =
    settings.storeClosedTabUrls && record.url.length > 0 ? record.url : "";

  const recovery: RecoveryRecord = {
    id: crypto.randomUUID(),
    closedAt: now,
    expiresAt: now + settings.recoveryRetentionDays * 24 * 60 * 60 * 1000,
    title: sanitizeTitle(record.title),
    url,
    originalWindowId: record.windowId,
    originalIndex: record.index,
    originalGroupId: record.groupId >= 0 ? record.groupId : undefined,
    wasPinned: record.pinned,
    lastActivatedAt: record.lastActivatedAt,
    closeReason,
    closeRuleMinutes,
    activityEventId,
  };

  const records = await loadRecords();
  records.unshift(recovery);
  await saveRecords(records);
  return recovery;
}

export async function patchRecoveryActivityId(
  recoveryId: string,
  activityEventId: string,
): Promise<void> {
  const records = await loadRecords();
  const idx = records.findIndex((r) => r.id === recoveryId);
  if (idx < 0) return;
  records[idx] = { ...records[idx]!, activityEventId };
  await saveRecords(records);
}

export async function deleteRecoveryRecords(ids: readonly string[]): Promise<number> {
  const idSet = new Set(ids);
  const records = await loadRecords();
  const remaining = records.filter((record) => !idSet.has(record.id));
  const deleted = records.length - remaining.length;
  if (deleted > 0) await saveRecords(remaining);
  return deleted;
}

export async function clearAllRecoveryRecords(): Promise<void> {
  await saveRecords([]);
}

async function pruneExpiredRecords(records: RecoveryRecord[]): Promise<number> {
  const now = Date.now();
  const remaining = records.filter((r) => r.expiresAt > now);
  const removed = records.length - remaining.length;
  if (removed > 0) await saveRecords(remaining);
  return removed;
}

export async function enforceRecoveryRetention(): Promise<number> {
  const settings = await loadSettings();
  let records = await loadRecords();
  const now = Date.now();
  const cutoff = now - settings.recoveryRetentionDays * 24 * 60 * 60 * 1000;
  const before = records.length;
  records = records.filter((r) => r.expiresAt > now && r.closedAt >= cutoff);
  records = records.slice(0, settings.maximumRecoveryRecords);
  await saveRecords(records);
  return before - records.length;
}

export async function restoreRecoveryRecords(
  recoveryIds: readonly string[],
  lock: boolean,
): Promise<number> {
  const records = await loadRecords();
  const byId = new Map(records.map((r) => [r.id, r]));

  const windows = await chrome.windows.getAll({ windowTypes: ["normal"] });
  const normalIds = windows.map((w) => w.id).filter((id): id is number => id !== undefined);
  const focused = windows.find((w) => w.focused)?.id;

  let restored = 0;

  for (const id of recoveryIds) {
    const recovery = byId.get(id);
    if (recovery === undefined) continue;
    if (recovery.url.length === 0 && !recovery.title) {
      throw new ExtensionError("RECOVERY_NOT_FOUND", "Missing URL for restore");
    }
    if (recovery.url.length === 0) continue;

    const windowId = selectRestoreWindowId(recovery.originalWindowId, normalIds, focused);
    if (windowId === undefined) {
      throw new ExtensionError("WINDOW_NOT_FOUND");
    }

    const tabs = await chrome.tabs.query({ windowId });
    const index = clampRestoreIndex(recovery.originalIndex, tabs.length);

    const created = await chrome.tabs.create({
      url: recovery.url,
      windowId,
      index,
      active: false,
    });

    if (created.id === undefined) continue;

    recovery.restoredAt = Date.now();
    restored++;

    await appendActivityEvent({
      type: "TAB_RESTORED",
      source: "MANUAL",
      message: `Restored "${recovery.title}"`,
      tabs: [{ title: recovery.title, url: recovery.url }],
      reversible: false,
      relatedRecoveryIds: [recovery.id],
      metadata: { locked: lock },
    });

    if (lock) {
      await lockTabs([created.id]);
    }
  }

  await saveRecords(records);
  return restored;
}

/** Back-fill activity for recovery records missing activityEventId after a crash. */
export async function repairOrphanedRecoveries(): Promise<number> {
  const records = await loadRecords();
  let repaired = 0;
  for (const record of records) {
    if (record.activityEventId !== undefined) continue;
    const event = await appendActivityEvent({
      type: "TAB_CLOSED",
      source: "AUTOMATIC_CLOSE",
      message: `Closed "${record.title}" (recovered after interruption)`,
      tabs: [{ title: record.title, url: record.url }],
      reason: record.closeReason,
      reversible: true,
      relatedRecoveryIds: [record.id],
    });
    record.activityEventId = event.id;
    repaired++;
  }
  if (repaired > 0) await saveRecords(records);
  return repaired;
}
