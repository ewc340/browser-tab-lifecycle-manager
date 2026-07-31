import { describe, expect, it } from "vitest";
import { computeDowntimeCreditMs, DOWNTIME_CREDIT_THRESHOLD_MS } from "../../shared/lifecycle.ts";
import { DAY, HOUR } from "../../shared/time.ts";
import { BASE_NOW } from "./fixtures.ts";

describe("computeDowntimeCreditMs", () => {
  it("returns zero when last sweep was recent", () => {
    expect(computeDowntimeCreditMs(BASE_NOW - 2 * HOUR, BASE_NOW)).toBe(0);
  });

  it("returns zero when there has never been a sweep", () => {
    expect(computeDowntimeCreditMs(0, BASE_NOW)).toBe(0);
  });

  it("credits the full gap when browser was closed longer than 12 hours", () => {
    const lastSweep = BASE_NOW - 14 * DAY;
    const credit = computeDowntimeCreditMs(lastSweep, BASE_NOW);
    expect(credit).toBe(14 * DAY);
    expect(credit).toBeGreaterThan(DOWNTIME_CREDIT_THRESHOLD_MS);
  });

  it("returns zero for gaps at or below the 12-hour threshold", () => {
    expect(computeDowntimeCreditMs(BASE_NOW - 12 * HOUR, BASE_NOW)).toBe(0);
  });
});
