/**
 * Migration framework tests with in-memory chrome.storage mocks.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const localStore: Record<string, unknown> = {};
const sessionStore: Record<string, unknown> = {};

function resetStores(): void {
  for (const key of Object.keys(localStore)) delete localStore[key];
  for (const key of Object.keys(sessionStore)) delete sessionStore[key];
}

function installChromeMock(): void {
  vi.stubGlobal("chrome", {
    storage: {
      local: {
        get: vi.fn((key: string | string[] | null) => {
          if (key === null) return Promise.resolve({ ...localStore });
          const keys = typeof key === "string" ? [key] : key;
          const result: Record<string, unknown> = {};
          for (const k of keys) {
            if (localStore[k] !== undefined) result[k] = localStore[k];
          }
          return Promise.resolve(result);
        }),
        set: vi.fn((patch: Record<string, unknown>) => {
          Object.assign(localStore, patch);
          return Promise.resolve();
        }),
        remove: vi.fn((keys: string[]) => {
          for (const k of keys) delete localStore[k];
          return Promise.resolve();
        }),
        getBytesInUse: vi.fn(() => Promise.resolve(0)),
      },
      session: {
        get: vi.fn((key: string) => Promise.resolve({ [key]: sessionStore[key] })),
        set: vi.fn((patch: Record<string, unknown>) => {
          Object.assign(sessionStore, patch);
          return Promise.resolve();
        }),
      },
    },
    runtime: {
      getManifest: () => ({ version: "0.1.0" }),
      id: "test-extension-id",
    },
  });
}

describe("migration-service", () => {
  beforeEach(() => {
    resetStores();
    vi.resetModules();
    installChromeMock();
  });

  it("runs migrations from version 0 to current and is idempotent", async () => {
    localStore["settings:v1"] = { sleepAfterMinutes: 1, schemaVersion: 1 };

    const { runMigrations, CURRENT_MIGRATION_VERSION } = await import(
      "../../background/migration-service.ts"
    );

    const first = await runMigrations();
    expect(first.ran).toBe(true);
    expect(first.toVersion).toBe(CURRENT_MIGRATION_VERSION);
    expect(localStore["migrationVersion"]).toBe(CURRENT_MIGRATION_VERSION);

    const settings = localStore["settings:v1"] as { sleepAfterMinutes: number };
    expect(settings.sleepAfterMinutes).toBeGreaterThanOrEqual(5);

    const second = await runMigrations();
    expect(second.toVersion).toBe(CURRENT_MIGRATION_VERSION);
    expect(localStore["migrationVersion"]).toBe(CURRENT_MIGRATION_VERSION);
  });

  it("creates a pre-migration backup before applying", async () => {
    localStore["settings:v1"] = { schemaVersion: 1, sleepAfterMinutes: 60 };
    localStore["lockRecords:v1"] = [];

    const { runMigrations } = await import("../../background/migration-service.ts");
    await runMigrations();

    expect(localStore["backup:preMigration:v1"]).toBeDefined();
  });

  it("skips when migration lock is already held", async () => {
    sessionStore["migrationLock"] = true;

    const { runMigrations } = await import("../../background/migration-service.ts");
    const result = await runMigrations();

    expect(result.ran).toBe(false);
    expect(localStore["migrationVersion"]).toBeUndefined();
  });
});
