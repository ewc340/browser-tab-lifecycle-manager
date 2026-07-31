/**
 * Export/import settings and optional recovery data (M3).
 */
import type { ExtensionSettings } from "../shared/types.ts";
import { normalizeSettings } from "../shared/defaults.ts";
import { ExtensionError } from "../shared/errors.ts";
import { loadSettings, updateSettings } from "./settings-service.ts";
import { exportActivityJson } from "./activity-service.ts";
import { listRecoveryRecords } from "./recovery-service.ts";

export async function exportExtensionData(includeRecovery: boolean): Promise<string> {
  const settings = await loadSettings();
  const activity = JSON.parse(await exportActivityJson()) as unknown;
  const payload: Record<string, unknown> = {
    schemaVersion: 1,
    exportedAt: Date.now(),
    settings,
    activity,
  };
  if (includeRecovery) {
    payload.recovery = await listRecoveryRecords();
  }
  return JSON.stringify(payload, null, 2);
}

export async function importSettingsFromJson(json: string): Promise<ExtensionSettings> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new ExtensionError("INVALID_REQUEST", "Settings JSON is not valid");
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new ExtensionError("INVALID_REQUEST", "Settings JSON must be an object");
  }

  const obj = parsed as Record<string, unknown>;
  const rawSettings = obj.settings ?? obj;
  const { settings, problems } = normalizeSettings(rawSettings);
  if (problems.length > 0) {
    throw new ExtensionError("INVALID_SETTINGS", problems.join(" "));
  }

  return updateSettings(settings);
}
