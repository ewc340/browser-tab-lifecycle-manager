import { describe, expect, it } from "vitest";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  validateSettingsPatch,
} from "../shared/defaults.ts";

// ── DEFAULT_SETTINGS ──────────────────────────────────────────────────────────

describe("DEFAULT_SETTINGS", () => {
  it("has onboardingCompleted false", () => {
    expect(DEFAULT_SETTINGS.onboardingCompleted).toBe(false);
  });

  it("has sleepEnabled false", () => {
    expect(DEFAULT_SETTINGS.sleepEnabled).toBe(false);
  });

  it("has autoCloseEnabled false", () => {
    expect(DEFAULT_SETTINGS.autoCloseEnabled).toBe(false);
  });

  it("has sleepAfterMinutes of 60", () => {
    expect(DEFAULT_SETTINGS.sleepAfterMinutes).toBe(60);
  });

  it("has closeAfterMinutes of 7 days (10080 minutes)", () => {
    expect(DEFAULT_SETTINGS.closeAfterMinutes).toBe(7 * 24 * 60);
  });

  it("has a non-empty neverSleepHosts list (seeded)", () => {
    expect(DEFAULT_SETTINGS.neverSleepHosts.length).toBeGreaterThan(0);
  });

  it("has an empty neverCloseHosts list", () => {
    expect(DEFAULT_SETTINGS.neverCloseHosts).toEqual([]);
  });
});

// ── normalizeSettings ─────────────────────────────────────────────────────────

describe("normalizeSettings", () => {
  it("fills missing fields from defaults when input is an empty object", () => {
    const { settings, problems } = normalizeSettings({});
    expect(settings.onboardingCompleted).toBe(DEFAULT_SETTINGS.onboardingCompleted);
    expect(settings.sleepAfterMinutes).toBe(DEFAULT_SETTINGS.sleepAfterMinutes);
    // Empty object is not a problem — it just gets defaults.
    expect(problems.length).toBe(0);
  });

  it("survives null input without throwing and falls back to defaults", () => {
    // null is treated like "absent storage key" — no problem reported, just defaults.
    const { settings } = normalizeSettings(null);
    expect(settings.sleepAfterMinutes).toBe(DEFAULT_SETTINGS.sleepAfterMinutes);
    expect(settings.onboardingCompleted).toBe(false);
  });

  it("reports a problem and restores defaults for a garbage string input", () => {
    const { settings, problems } = normalizeSettings("garbage");
    expect(settings.sleepAfterMinutes).toBe(DEFAULT_SETTINGS.sleepAfterMinutes);
    expect(problems.length).toBeGreaterThan(0);
  });

  it("reports a problem and restores defaults for an array input", () => {
    const { settings, problems } = normalizeSettings([]);
    expect(settings.sleepAfterMinutes).toBe(DEFAULT_SETTINGS.sleepAfterMinutes);
    expect(problems.length).toBeGreaterThan(0);
  });

  it("rejects an out-of-range sleepAfterMinutes and resets to default", () => {
    const { settings, problems } = normalizeSettings({ sleepAfterMinutes: 1 }); // below min 5
    expect(settings.sleepAfterMinutes).toBe(DEFAULT_SETTINGS.sleepAfterMinutes);
    expect(problems.some((p) => p.includes("sleepAfterMinutes"))).toBe(true);
  });

  it("raises closeAfterMinutes when it is below sleepAfterMinutes", () => {
    const { settings, problems } = normalizeSettings({
      sleepAfterMinutes: 120,
      closeAfterMinutes: 60,
    });
    expect(settings.closeAfterMinutes).toBeGreaterThanOrEqual(settings.sleepAfterMinutes);
    expect(problems.some((p) => p.includes("close threshold"))).toBe(true);
  });

  it("accepts valid settings without problems", () => {
    const { settings, problems } = normalizeSettings({
      sleepAfterMinutes: 30,
      closeAfterMinutes: 180,
    });
    expect(settings.sleepAfterMinutes).toBe(30);
    expect(settings.closeAfterMinutes).toBe(180);
    expect(problems.length).toBe(0);
  });

  it("preserves boolean flags", () => {
    const { settings } = normalizeSettings({ onboardingCompleted: true, automationPaused: true });
    expect(settings.onboardingCompleted).toBe(true);
    expect(settings.automationPaused).toBe(true);
  });
});

// ── validateSettingsPatch ─────────────────────────────────────────────────────

describe("validateSettingsPatch", () => {
  it("returns no problems for a valid patch", () => {
    expect(validateSettingsPatch({ sleepAfterMinutes: 30 })).toEqual([]);
  });

  it("reports an unknown key", () => {
    const problems = validateSettingsPatch({ unknownField: true });
    expect(problems.some((p) => p.includes("unknownField"))).toBe(true);
  });

  it("reports an out-of-range sleepAfterMinutes", () => {
    const problems = validateSettingsPatch({ sleepAfterMinutes: 0 });
    expect(problems.some((p) => p.includes("sleepAfterMinutes"))).toBe(true);
  });

  it("reports an out-of-range closeAfterMinutes", () => {
    const problems = validateSettingsPatch({ closeAfterMinutes: 10 }); // below min 60
    expect(problems.some((p) => p.includes("closeAfterMinutes"))).toBe(true);
  });

  it("reports an inverted threshold pair (close < sleep)", () => {
    const problems = validateSettingsPatch({
      sleepAfterMinutes: 200,
      closeAfterMinutes: 100,
    });
    expect(problems.some((p) => p.includes("close threshold") || p.includes("shorter"))).toBe(
      true,
    );
  });

  it("accepts a valid pair where closeAfter equals sleepAfter", () => {
    const problems = validateSettingsPatch({
      sleepAfterMinutes: 120,
      closeAfterMinutes: 120,
    });
    expect(problems).toEqual([]);
  });

  it("accepts a valid pair where closeAfter is greater than sleepAfter", () => {
    const problems = validateSettingsPatch({
      sleepAfterMinutes: 60,
      closeAfterMinutes: 120,
    });
    expect(problems).toEqual([]);
  });
});
