/**
 * Durable URL-keyed activity ledger with LRU eviction (cap 2000).
 *
 * Tab ids are session-scoped; the ledger lets inactivity clocks survive restarts.
 */
import type { LedgerEntry, ManagedTabRecord } from "../shared/types.ts";
import { getLocal, setLocal, LOCAL_KEY_ACTIVITY_LEDGER } from "./storage.ts";

export const LEDGER_CAP = 2000;

type LedgerStore = Record<string, LedgerEntry>;

async function loadLedger(): Promise<LedgerStore> {
  return getLocal<LedgerStore>(LOCAL_KEY_ACTIVITY_LEDGER, {});
}

async function saveLedger(ledger: LedgerStore): Promise<void> {
  await setLocal({ [LOCAL_KEY_ACTIVITY_LEDGER]: ledger });
}

function touchEntry(
  ledger: LedgerStore,
  normalizedUrl: string,
  patch: Partial<LedgerEntry>,
  now: number,
): LedgerStore {
  const existing = ledger[normalizedUrl];
  const entry: LedgerEntry = {
    lastActivatedAt: patch.lastActivatedAt ?? existing?.lastActivatedAt ?? now,
    firstObservedAt: patch.firstObservedAt ?? existing?.firstObservedAt ?? now,
    neverActivated: patch.neverActivated ?? existing?.neverActivated ?? true,
    snoozedUntil: patch.snoozedUntil ?? existing?.snoozedUntil,
    lastSeenAt: now,
  };
  return { ...ledger, [normalizedUrl]: entry };
}

function evictIfNeeded(ledger: LedgerStore): LedgerStore {
  const keys = Object.keys(ledger);
  if (keys.length <= LEDGER_CAP) return ledger;

  const sorted = keys.sort((a, b) => ledger[a]!.lastSeenAt - ledger[b]!.lastSeenAt);
  const next = { ...ledger };
  for (let i = 0; i < keys.length - LEDGER_CAP; i++) {
    delete next[sorted[i]!];
  }
  return next;
}

export async function recordTabActivation(
  normalizedUrl: string,
  now: number,
  firstObservedAt?: number,
): Promise<void> {
  let ledger = await loadLedger();
  ledger = touchEntry(
    ledger,
    normalizedUrl,
    {
      lastActivatedAt: now,
      neverActivated: false,
      firstObservedAt: firstObservedAt ?? ledger[normalizedUrl]?.firstObservedAt ?? now,
    },
    now,
  );
  ledger = evictIfNeeded(ledger);
  await saveLedger(ledger);
}

export async function recordTabObserved(tab: ManagedTabRecord, now: number): Promise<void> {
  let ledger = await loadLedger();
  const existing = ledger[tab.normalizedUrl];
  ledger = touchEntry(
    ledger,
    tab.normalizedUrl,
    {
      firstObservedAt: tab.firstObservedAt,
      lastActivatedAt: tab.lastActivatedAt,
      neverActivated: tab.neverActivated,
      snoozedUntil: tab.snoozedUntil,
      ...(existing === undefined ? { firstObservedAt: tab.firstObservedAt } : {}),
    },
    now,
  );
  ledger = evictIfNeeded(ledger);
  await saveLedger(ledger);
}

export async function setLedgerSnooze(
  normalizedUrl: string,
  untilMs: number | undefined,
  now: number,
): Promise<void> {
  let ledger = await loadLedger();
  ledger = touchEntry(ledger, normalizedUrl, { snoozedUntil: untilMs }, now);
  ledger = evictIfNeeded(ledger);
  await saveLedger(ledger);
}

/**
 * Seeds tab records from the ledger after reconciliation.
 */
export async function applyLedgerToRecords(
  records: Map<number, ManagedTabRecord>,
): Promise<void> {
  const ledger = await loadLedger();
  for (const [tabId, record] of records) {
    const entry = ledger[record.normalizedUrl];
    if (entry === undefined) continue;

    records.set(tabId, {
      ...record,
      lastActivatedAt: Math.max(record.lastActivatedAt, entry.lastActivatedAt, record.firstObservedAt),
      neverActivated: entry.neverActivated && record.neverActivated,
      snoozedUntil: entry.snoozedUntil ?? record.snoozedUntil,
    });
  }
}

export async function getLedgerEntry(normalizedUrl: string): Promise<LedgerEntry | undefined> {
  const ledger = await loadLedger();
  return ledger[normalizedUrl];
}
