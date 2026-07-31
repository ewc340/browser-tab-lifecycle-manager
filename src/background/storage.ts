/**
 * The only module that calls chrome.storage directly.
 *
 * All other background modules go through these helpers so there is one place to
 * handle quota errors and serialization concerns.
 */
import { ExtensionError, isQuotaError, toExtensionError } from "../shared/errors.ts";
import * as log from "../shared/log.ts";

// ── Session storage keys ──────────────────────────────────────────────────────
// Volatile: in-memory only, cleared when the browser restarts or the extension
// reloads. Appropriate for tab IDs, which are session-scoped anyway.

export const SESSION_KEY_TAB_RECORDS = "tabRecords";
export const SESSION_KEY_CLOSING_TAB_IDS = "closingTabIds";
export const SESSION_KEY_SWEEP_LEASE = "sweepLease";
export const SESSION_KEY_SWEEP_COUNTERS = "sweepCounters";
export const SESSION_KEY_MIGRATION_LOCK = "migrationLock";

// ── Local storage keys ────────────────────────────────────────────────────────
// Durable across restarts. Keys are versioned so schema migrations can be
// detected by checking whether the unversioned key still exists.

export const LOCAL_KEY_SETTINGS = "settings:v1";
export const LOCAL_KEY_LOCK_RECORDS = "lockRecords:v1";
export const LOCAL_KEY_ACTIVITY_LEDGER = "activityLedger:v1";
export const LOCAL_KEY_ACTIVITY_INDEX = "activityIndex:v1";
export const LOCAL_KEY_RECOVERY_RECORDS = "recoveryRecords:v1";
export const LOCAL_KEY_RUNTIME_STATE = "runtimeState:v1";
export const LOCAL_KEY_DIAGNOSTICS = "diagnostics:v1";
export const LOCAL_KEY_MIGRATION_VERSION = "migrationVersion";

// ── Read helpers ──────────────────────────────────────────────────────────────

export async function getLocal<T>(key: string, fallback: T): Promise<T> {
  try {
    const result = await chrome.storage.local.get(key);
    const raw: unknown = result[key];
    return raw !== undefined ? (raw as T) : fallback;
  } catch (e) {
    log.error("storage.getLocal failed for key", key, e);
    throw new ExtensionError("STORAGE_READ_FAILED", e instanceof Error ? e.message : undefined);
  }
}

export async function getSession<T>(key: string, fallback: T): Promise<T> {
  try {
    const result = await chrome.storage.session.get(key);
    const raw: unknown = result[key];
    return raw !== undefined ? (raw as T) : fallback;
  } catch (e) {
    log.error("storage.getSession failed for key", key, e);
    throw new ExtensionError("STORAGE_READ_FAILED", e instanceof Error ? e.message : undefined);
  }
}

// ── Write helpers ─────────────────────────────────────────────────────────────

/**
 * Writes to local storage. Rethrows quota errors as STORAGE_QUOTA_EXCEEDED so
 * callers can present a human-readable message.
 *
 * On quota pressure, trims oldest history once and retries.
 */
export async function setLocal(patch: Record<string, unknown>): Promise<void> {
  try {
    await chrome.storage.local.set(patch);
  } catch (e) {
    if (!isQuotaError(e)) {
      throw toExtensionError(e, "STORAGE_WRITE_FAILED");
    }
    await trimHistory({ aggressive: true });
    try {
      await chrome.storage.local.set(patch);
    } catch (retryError) {
      if (isQuotaError(retryError)) {
        throw new ExtensionError(
          "STORAGE_QUOTA_EXCEEDED",
          retryError instanceof Error ? retryError.message : undefined,
        );
      }
      throw toExtensionError(retryError, "STORAGE_WRITE_FAILED");
    }
  }
}

export async function setSession(patch: Record<string, unknown>): Promise<void> {
  try {
    await chrome.storage.session.set(patch);
  } catch (e) {
    throw toExtensionError(e, "STORAGE_WRITE_FAILED");
  }
}

export async function removeLocal(keys: string[]): Promise<void> {
  try {
    await chrome.storage.local.remove(keys);
  } catch (e) {
    throw toExtensionError(e, "STORAGE_WRITE_FAILED");
  }
}

export async function getBytesInUse(): Promise<number> {
  try {
    return await chrome.storage.local.getBytesInUse(null);
  } catch {
    return 0;
  }
}

/** Evicts oldest activity buckets and recovery records under quota pressure. */
export async function trimHistory(_options?: { aggressive?: boolean }): Promise<void> {
  const { enforceActivityRetention } = await import("./activity-service.ts");
  const { enforceRecoveryRetention } = await import("./recovery-service.ts");
  const { loadSettings } = await import("./settings-service.ts");
  const settings = await loadSettings();
  const maxEvents = Math.max(50, Math.floor(settings.maximumActivityEvents / 2));
  await enforceActivityRetention(maxEvents, settings.activityRetentionDays);
  await enforceRecoveryRetention();
}
