/**
 * CRUD over tab records in chrome.storage.session.
 *
 * Session storage is the right home for tab records because tab IDs are
 * session-scoped: persisting them to disk guarantees stale data after every
 * browser restart. Records are tombstoned on removal (removedAt is set, not
 * deleted) so event ordering can be reconciled and onReplaced transfers are
 * reliable.
 */
import type { ManagedTabRecord } from "../shared/types.ts";
import { classifyManageability } from "../shared/eligibility.ts";
import { normalizeUrl } from "../shared/url-normalizer.ts";
import { sanitizeTitle, sanitizeUrl } from "../shared/sanitize.ts";
import { getSession, setSession, SESSION_KEY_TAB_RECORDS, SESSION_KEY_LAST_RECONCILE_AT } from "./storage.ts";
import * as log from "../shared/log.ts";

// ── Serialization ─────────────────────────────────────────────────────────────
// chrome.storage converts object keys to strings, so a Map<number, …> must be
// stored as Record<string, …> and converted back on read.

type SerializedRecords = Record<string, ManagedTabRecord>;

function fromStorage(raw: SerializedRecords): Map<number, ManagedTabRecord> {
  const map = new Map<number, ManagedTabRecord>();
  for (const [key, record] of Object.entries(raw)) {
    map.set(Number(key), record);
  }
  return map;
}

function toStorage(records: Map<number, ManagedTabRecord>): SerializedRecords {
  const obj: SerializedRecords = {};
  for (const [tabId, record] of records) {
    obj[String(tabId)] = record;
  }
  return obj;
}

async function loadRecords(): Promise<Map<number, ManagedTabRecord>> {
  const raw = await getSession<SerializedRecords>(SESSION_KEY_TAB_RECORDS, {});
  return fromStorage(raw);
}

async function persistRecords(records: Map<number, ManagedTabRecord>): Promise<void> {
  await setSession({ [SESSION_KEY_TAB_RECORDS]: toStorage(records) });
}

// ── Record construction ───────────────────────────────────────────────────────

/**
 * Builds a ManagedTabRecord from a live chrome.tabs.Tab. When an existing record
 * is supplied, accumulated fields (firstObservedAt, lastActivatedAt, lock/keep/
 * snooze state, inactivityCreditMs, pending-close state) are carried forward so
 * only fields that Chrome owns (url, title, active, …) are refreshed.
 */
export function recordFromTab(
  tab: chrome.tabs.Tab,
  windowType: NonNullable<chrome.windows.Window["type"]> | "unknown" | undefined,
  existing: ManagedTabRecord | undefined,
  now: number,
): ManagedTabRecord {
  const tabId = tab.id ?? 0;
  const rawUrl = tab.url ?? "";
  const url = sanitizeUrl(rawUrl);
  const title = sanitizeTitle(tab.title);
  const normalizedUrl = normalizeUrl(rawUrl);

  const { canDiscard, canClose, unavailableReason } = classifyManageability({
    url: rawUrl,
    title: tab.title,
    incognito: tab.incognito,
    windowType,
  });

  // lastActivatedAt: carry forward from an existing record, otherwise seed from
  // Chrome's own lastAccessed (Chrome 121+, always present given our minimum_chrome_version).
  const lastActivatedAt =
    existing?.lastActivatedAt ?? tab.lastAccessed ?? now;

  const record: ManagedTabRecord = {
    tabId,
    windowId: tab.windowId,
    index: tab.index,
    groupId: tab.groupId,

    url,
    normalizedUrl,
    title,
    favIconUrl: tab.favIconUrl,

    firstObservedAt: existing?.firstObservedAt ?? now,
    lastActivatedAt,
    lastUpdatedAt: now,

    active: tab.active,
    pinned: tab.pinned,
    audible: tab.audible ?? false,
    discarded: tab.discarded,
    frozen: tab.frozen,
    incognito: tab.incognito,
    status: tab.status,
    autoDiscardable: tab.autoDiscardable,

    neverActivated: existing?.neverActivated ?? !tab.active,
    discardedBy: existing?.discardedBy,

    canDiscard,
    canClose,
    unavailableReason,

    closeLocked: existing?.closeLocked ?? false,
    lockId: existing?.lockId,
    keepLoaded: existing?.keepLoaded ?? false,
    snoozedUntil: existing?.snoozedUntil,

    inactivityCreditMs: existing?.inactivityCreditMs ?? 0,

    pendingCloseAt: existing?.pendingCloseAt,
    pendingCloseScheduledAt: existing?.pendingCloseScheduledAt,
    pendingCloseReason: existing?.pendingCloseReason,
    pendingCloseRuleMinutes: existing?.pendingCloseRuleMinutes,

    removedAt: existing?.removedAt,
  };

  return record;
}

// ── Reconciliation ────────────────────────────────────────────────────────────

/**
 * Merges every strategy Chromium exposes. Arc and other forks sometimes omit tabs
 * from a bare `tabs.query({})` but include them on per-window or populated-window queries.
 */
export async function queryAllBrowserTabs(): Promise<chrome.tabs.Tab[]> {
  const merged = new Map<number, chrome.tabs.Tab>();

  const add = (tab: chrome.tabs.Tab): void => {
    if (tab.id !== undefined) merged.set(tab.id, tab);
  };

  try {
    for (const tab of await chrome.tabs.query({})) add(tab);
  } catch (e) {
    log.error("tabs.query({}) failed", e);
  }

  let windows: chrome.windows.Window[] = [];
  try {
    windows = await chrome.windows.getAll({ populate: true });
  } catch (e) {
    log.error("windows.getAll({ populate: true }) failed", e);
    try {
      windows = await chrome.windows.getAll();
    } catch (inner) {
      log.error("windows.getAll() failed", inner);
    }
  }

  for (const win of windows) {
    if (win.tabs) {
      for (const tab of win.tabs) add(tab);
    }
    if (win.id !== undefined) {
      try {
        for (const tab of await chrome.tabs.query({ windowId: win.id })) add(tab);
      } catch {
        // Window may have closed between getAll and query.
      }
    }
  }

  return [...merged.values()];
}

/**
 * The authoritative source of truth. Queries Chrome for all tabs and windows,
 * merges with stored records (carrying forward accumulated state), drops
 * tombstones for tabs that no longer exist, and persists the result.
 *
 * Event handlers only optimise latency; this is what makes records correct.
 */
export async function reconcileFromBrowser(
  now: number,
): Promise<Map<number, ManagedTabRecord>> {
  const tabs = await queryAllBrowserTabs();
  const windows = await chrome.windows.getAll({ populate: true }).catch(async () =>
    chrome.windows.getAll(),
  );

  const windowTypeMap = new Map<number, NonNullable<chrome.windows.Window["type"]> | "unknown">();
  for (const win of windows) {
    if (win.id !== undefined) {
      windowTypeMap.set(win.id, win.type ?? "unknown");
    }
  }

  const existing = await loadRecords();
  const fresh = new Map<number, ManagedTabRecord>();

  for (const tab of tabs) {
    if (tab.id === undefined) continue;
    const windowType = windowTypeMap.get(tab.windowId) ?? "unknown";
    const prior = existing.get(tab.id);
    fresh.set(tab.id, recordFromTab(tab, windowType, prior, now));
  }

  log.debug("reconciled", fresh.size, "tab records from", tabs.length, "browser tabs");
  await persistRecords(fresh);
  await setSession({ [SESSION_KEY_LAST_RECONCILE_AT]: now });
  const { invalidateAppStateCache } = await import("./app-state-cache.ts");
  invalidateAppStateCache();
  return fresh;
}

// ── CRUD operations ───────────────────────────────────────────────────────────

export async function getRecords(): Promise<Map<number, ManagedTabRecord>> {
  return loadRecords();
}

export async function putRecord(record: ManagedTabRecord): Promise<void> {
  const records = await loadRecords();
  records.set(record.tabId, record);
  await persistRecords(records);
}

/**
 * Persists a complete, already-mutated map in a single storage write.
 * Use this when the caller already holds the full record set and has mutated
 * multiple entries — it avoids redundant reads compared to calling patchRecord
 * in a loop.
 */
export async function putRecords(records: Map<number, ManagedTabRecord>): Promise<void> {
  await persistRecords(records);
}

export async function patchRecord(
  tabId: number,
  patch: Partial<ManagedTabRecord>,
): Promise<void> {
  const records = await loadRecords();
  const existing = records.get(tabId);
  if (existing === undefined) {
    log.warn("patchRecord: no record for tab", tabId);
    return;
  }
  records.set(tabId, { ...existing, ...patch });
  await persistRecords(records);
}

/**
 * Tombstones a removed tab. The record is kept so onReplaced transfers and
 * post-close activity back-fill work correctly regardless of event ordering.
 * Tombstones are purged by the next sweep.
 */
export async function markRemoved(tabId: number, now: number): Promise<void> {
  await patchRecord(tabId, { removedAt: now, active: false });
  const { invalidateAppStateCache } = await import("./app-state-cache.ts");
  invalidateAppStateCache();
}

/**
 * Removes tombstoned records whose removedAt is older than olderThan.
 * Called by the sweep (Milestone 2+).
 */
export async function purgeTombstones(olderThan: number): Promise<void> {
  const records = await loadRecords();
  let changed = false;
  for (const [tabId, record] of records) {
    if (record.removedAt !== undefined && record.removedAt < olderThan) {
      records.delete(tabId);
      changed = true;
    }
  }
  if (changed) {
    await persistRecords(records);
  }
}
