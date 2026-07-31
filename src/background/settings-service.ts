/**
 * Loads, normalizes, and persists extension settings.
 *
 * The service worker can be terminated at any time, so there is no in-memory
 * cache here — every call reads from storage. `normalizeSettings` coerces
 * whatever is stored into a valid ExtensionSettings so callers never see
 * corrupted data.
 */
import type { ExtensionSettings } from "../shared/types.ts";
import { normalizeSettings, validateSettingsPatch } from "../shared/defaults.ts";
import { ExtensionError } from "../shared/errors.ts";
import { getLocal, setLocal, LOCAL_KEY_SETTINGS } from "./storage.ts";

export async function loadSettings(): Promise<ExtensionSettings> {
  const raw = await getLocal<unknown>(LOCAL_KEY_SETTINGS, undefined);
  const { settings, problems } = normalizeSettings(raw);

  // Persist if the key was absent or normalization changed anything (e.g. after
  // a schema update or first run). This makes future reads stable.
  if (raw === undefined || problems.length > 0) {
    await setLocal({ [LOCAL_KEY_SETTINGS]: settings });
  }

  return settings;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await setLocal({ [LOCAL_KEY_SETTINGS]: settings });
}

/**
 * Applies a validated patch to the current settings and persists the result.
 * Cross-field constraints (e.g. closeAfter ≥ sleepAfter) are enforced by
 * running normalizeSettings on the merged object.
 */
export async function updateSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const problems = validateSettingsPatch(patch);
  if (problems.length > 0) {
    throw new ExtensionError("INVALID_SETTINGS", problems.join(" "));
  }

  const current = await loadSettings();
  const merged = { ...current, ...patch };
  const { settings } = normalizeSettings(merged);
  await saveSettings(settings);
  return settings;
}
