/**
 * Recovery record storage for automatic closures (Milestone 2 subset).
 */
import type { ManagedTabRecord, RecoveryRecord } from "../shared/types.ts";
import { sanitizeTitle } from "../shared/sanitize.ts";
import { getLocal, setLocal, LOCAL_KEY_RECOVERY_RECORDS } from "./storage.ts";
import { loadSettings } from "./settings-service.ts";

const MAX_RECORDS = 500;

function newRecoveryId(): string {
  return crypto.randomUUID();
}

async function loadRecords(): Promise<RecoveryRecord[]> {
  return getLocal<RecoveryRecord[]>(LOCAL_KEY_RECOVERY_RECORDS, []);
}

async function saveRecords(records: RecoveryRecord[]): Promise<void> {
  await setLocal({ [LOCAL_KEY_RECOVERY_RECORDS]: records.slice(0, MAX_RECORDS) });
}

export async function listRecoveryRecords(): Promise<RecoveryRecord[]> {
  return loadRecords();
}

export async function createRecoveryRecord(
  record: ManagedTabRecord,
  closeReason: string,
  closeRuleMinutes: number,
  activityEventId?: string,
): Promise<RecoveryRecord | null> {
  const settings = await loadSettings();
  if (!settings.storeClosedTabUrls && record.url.length > 0 && !record.url.startsWith("chrome://")) {
    // Still create a record with title only when user disabled URL storage.
  }

  const now = Date.now();
  const recovery: RecoveryRecord = {
    id: newRecoveryId(),
    closedAt: now,
    expiresAt: now + settings.recoveryRetentionDays * 24 * 60 * 60 * 1000,
    title: sanitizeTitle(record.title),
    url: settings.storeClosedTabUrls ? record.url : "",
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

export async function deleteRecoveryRecords(ids: readonly string[]): Promise<number> {
  const idSet = new Set(ids);
  const records = await loadRecords();
  const remaining = records.filter((record) => !idSet.has(record.id));
  const deleted = records.length - remaining.length;
  if (deleted > 0) await saveRecords(remaining);
  return deleted;
}
