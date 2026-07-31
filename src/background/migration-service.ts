/**
 * Ordered, idempotent schema migrations (review G11).
 *
 * Runs inside onInstalled before reconciliation touches storage. Guarded by a
 * session lock so concurrent service-worker starts cannot double-run migrations.
 */
import { normalizeSettings } from "../shared/defaults.ts";
import { appendActivityEvent } from "./activity-service.ts";
import { loadSettings, saveSettings } from "./settings-service.ts";
import {
  getLocal,
  setLocal,
  getSession,
  setSession,
  LOCAL_KEY_SETTINGS,
  LOCAL_KEY_LOCK_RECORDS,
  LOCAL_KEY_MIGRATION_VERSION,
  SESSION_KEY_MIGRATION_LOCK,
} from "./storage.ts";
import * as log from "../shared/log.ts";

export const CURRENT_MIGRATION_VERSION = 1;

export interface Migration {
  to: number;
  description: string;
  run: () => Promise<void>;
}

function backupKeyForVersion(version: number): string {
  return `backup:preMigration:v${version}`;
}

/** Migration 1: normalize settings and ensure runtime fields exist on stored records. */
const migrationV1: Migration = {
  to: 1,
  description: "Normalize settings schema to v1",
  run: async () => {
    const raw = await getLocal<unknown>(LOCAL_KEY_SETTINGS, undefined);
    const { settings } = normalizeSettings(raw);
    await saveSettings(settings);
  },
};

export const MIGRATIONS: readonly Migration[] = [migrationV1];

export interface MigrationResult {
  ran: boolean;
  fromVersion: number;
  toVersion: number;
  error?: string;
}

async function acquireMigrationLock(): Promise<boolean> {
  const locked = await getSession<boolean>(SESSION_KEY_MIGRATION_LOCK, false);
  if (locked) return false;
  await setSession({ [SESSION_KEY_MIGRATION_LOCK]: true });
  return true;
}

async function releaseMigrationLock(): Promise<void> {
  await setSession({ [SESSION_KEY_MIGRATION_LOCK]: false });
}

async function backupBeforeMigration(targetVersion: number): Promise<void> {
  const [settings, lockRecords] = await Promise.all([
    getLocal(LOCAL_KEY_SETTINGS, null),
    getLocal(LOCAL_KEY_LOCK_RECORDS, null),
  ]);
  await setLocal({
    [backupKeyForVersion(targetVersion)]: {
      settings,
      lockRecords,
      backedUpAt: Date.now(),
    },
  });
}

export async function runMigrations(): Promise<MigrationResult> {
  const acquired = await acquireMigrationLock();
  if (!acquired) {
    return { ran: false, fromVersion: -1, toVersion: -1 };
  }

  let fromVersion = await getLocal<number>(LOCAL_KEY_MIGRATION_VERSION, 0);
  const startVersion = fromVersion;

  try {
    for (const migration of MIGRATIONS) {
      if (migration.to <= fromVersion) continue;

      log.info("running migration", migration.to, migration.description);
      await backupBeforeMigration(migration.to);
      await migration.run();
      fromVersion = migration.to;
      await setLocal({ [LOCAL_KEY_MIGRATION_VERSION]: fromVersion });
    }

    return { ran: true, fromVersion: startVersion, toVersion: fromVersion };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.error("migration failed", message);

    const settings = await loadSettings();
    await saveSettings({ ...settings, automationPaused: true });

    await appendActivityEvent({
      type: "ERROR",
      source: "SYSTEM",
      message: `Storage migration failed: ${message}. Automatic management was paused.`,
      tabs: [],
      reversible: false,
    });

    return { ran: true, fromVersion, toVersion: fromVersion, error: message };
  } finally {
    await releaseMigrationLock();
  }
}
