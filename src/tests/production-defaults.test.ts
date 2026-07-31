/**
 * Shipped production defaults — Milestone 4 verification (plan task 10).
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, DEV_FAST_LIFECYCLE } from "../shared/defaults.ts";

describe("production defaults", () => {
  it("ships with automation disabled until onboarding", () => {
    expect(DEFAULT_SETTINGS.onboardingCompleted).toBe(false);
    expect(DEFAULT_SETTINGS.sleepEnabled).toBe(false);
    expect(DEFAULT_SETTINGS.autoCloseEnabled).toBe(false);
  });

  it("uses production sleep and close thresholds", () => {
    expect(DEFAULT_SETTINGS.sleepAfterMinutes).toBe(60);
    expect(DEFAULT_SETTINGS.closeAfterMinutes).toBe(7 * 24 * 60);
  });

  it("keeps DEV_FAST_LIFECYCLE separate from production defaults", () => {
    expect(DEV_FAST_LIFECYCLE.sleepAfterMinutes).not.toBe(DEFAULT_SETTINGS.sleepAfterMinutes);
    expect(DEV_FAST_LIFECYCLE.closeAfterMinutes).not.toBe(DEFAULT_SETTINGS.closeAfterMinutes);
    expect(DEV_FAST_LIFECYCLE.closeAfterMinutes).toBeLessThan(DEFAULT_SETTINGS.closeAfterMinutes);
  });
});
