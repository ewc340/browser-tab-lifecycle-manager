/**
 * Lock CRUD and tab-record mirroring.
 *
 * Locks are durable (storage.local) because they must survive browser restarts
 * and be rebound to new tab instances after navigation. The tab record carries a
 * mirrored closeLocked flag for fast panel rendering.
 */
import type { ManagedTabRecord, TabLockRecord } from "../shared/types.ts";
import { normalizeUrl } from "../shared/url-normalizer.ts";
import { sanitizeTitle, sanitizeUrl, hostnameOf } from "../shared/sanitize.ts";
import { getLocal, setLocal, LOCAL_KEY_LOCK_RECORDS } from "./storage.ts";
import { getRecords, putRecords } from "./tab-repository.ts";
import { loadSettings } from "./settings-service.ts";
import * as log from "../shared/log.ts";

function newLockId(): string {
  return crypto.randomUUID();
}

async function loadLocks(): Promise<TabLockRecord[]> {
  return getLocal<TabLockRecord[]>(LOCAL_KEY_LOCK_RECORDS, []);
}

async function saveLocks(locks: TabLockRecord[]): Promise<void> {
  await setLocal({ [LOCAL_KEY_LOCK_RECORDS]: locks });
}

export async function lockTabs(tabIds: readonly number[]): Promise<number> {
  let locks = await loadLocks();
  const records = await getRecords();
  const settings = await loadSettings();

  let changed = 0;

  for (const tabId of tabIds) {
    const record = records.get(tabId);
    if (record === undefined || record.removedAt !== undefined || record.closeLocked) continue;

    const lock: TabLockRecord = {
      lockId: newLockId(),
      currentTabId: tabId,
      url: record.url,
      normalizedUrl: record.normalizedUrl,
      windowId: record.windowId,
      index: record.index,
      title: record.title,
      lockedAt: Date.now(),
    };

    locks = locks.filter((entry) => entry.currentTabId !== tabId);
    locks.push(lock);

    const patch: Partial<ManagedTabRecord> = {
      closeLocked: true,
      lockId: lock.lockId,
    };

    if (settings.lockImpliesKeepLoaded) {
      patch.keepLoaded = true;
      patch.autoDiscardable = false;
      try {
        await chrome.tabs.update(tabId, { autoDiscardable: false });
      } catch (e) {
        log.warn("lockTabs: could not set autoDiscardable", tabId, e);
      }
    }

    records.set(tabId, { ...record, ...patch });
    changed++;
  }

  if (changed > 0) {
    await Promise.all([saveLocks(locks), putRecords(records)]);
  }

  return changed;
}

export async function unlockTabs(tabIds: readonly number[]): Promise<number> {
  const [locks, records] = await Promise.all([loadLocks(), getRecords()]);
  const tabIdSet = new Set(tabIds);
  const remaining = locks.filter((lock) => !tabIdSet.has(lock.currentTabId));
  const changed = locks.length - remaining.length;

  for (const tabId of tabIds) {
    const record = records.get(tabId);
    if (record === undefined || !record.closeLocked) continue;

    records.set(tabId, {
      ...record,
      closeLocked: false,
      lockId: undefined,
    });
  }

  if (changed > 0) {
    await Promise.all([saveLocks(remaining), putRecords(records)]);
  }

  return changed;
}

/**
 * Keeps lock metadata in sync when a locked tab navigates or renames.
 * Returns true when the origin changed (caller may surface a warning).
 */
export async function refreshLockFromTab(
  tab: chrome.tabs.Tab,
  record: ManagedTabRecord,
): Promise<{ originChanged: boolean }> {
  if (!record.closeLocked || record.lockId === undefined || tab.id === undefined) {
    return { originChanged: false };
  }

  const locks = await loadLocks();
  const lock = locks.find((entry) => entry.lockId === record.lockId);
  if (lock === undefined) return { originChanged: false };

  const rawUrl = tab.url ?? "";
  const url = sanitizeUrl(rawUrl);
  const normalizedUrl = normalizeUrl(rawUrl);
  const title = sanitizeTitle(tab.title);
  const previousHost = hostnameOf(lock.url);
  const nextHost = hostnameOf(url);
  const originChanged = previousHost.length > 0 && nextHost.length > 0 && previousHost !== nextHost;

  const updated: TabLockRecord = {
    ...lock,
    currentTabId: tab.id,
    url,
    normalizedUrl,
    title,
    windowId: tab.windowId,
    index: tab.index,
  };

  const nextLocks = locks.map((entry) => (entry.lockId === lock.lockId ? updated : entry));
  await saveLocks(nextLocks);

  if (originChanged) {
    log.warn("lock origin changed", previousHost, "->", nextHost, "tab", tab.id);
  }

  return { originChanged };
}

/** Applies closeLocked from durable locks after reconcile (startup path). */
export async function applyLocksToRecords(records: Map<number, ManagedTabRecord>): Promise<void> {
  const locks = await loadLocks();
  const byTabId = new Map(locks.map((lock) => [lock.currentTabId, lock]));

  for (const [tabId, record] of records) {
    const lock = byTabId.get(tabId);
    if (lock !== undefined) {
      records.set(tabId, { ...record, closeLocked: true, lockId: lock.lockId });
    }
  }
}

export async function isTabLocked(tabId: number): Promise<boolean> {
  const records = await getRecords();
  return records.get(tabId)?.closeLocked === true;
}
