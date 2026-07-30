import { describe, expect, it } from "vitest";
import {
  DAY,
  HOUR,
  MINUTE,
  SECOND,
  elapsed,
  formatDurationMinutes,
  formatShortDuration,
} from "../shared/time.ts";

// ── formatShortDuration ───────────────────────────────────────────────────────

describe("formatShortDuration", () => {
  it("returns 'just now' for 0 ms", () => {
    expect(formatShortDuration(0)).toBe("just now");
  });

  it("returns 'just now' for negative values (clamped at zero)", () => {
    expect(formatShortDuration(-5000)).toBe("just now");
  });

  it("returns 'just now' for values under 1 minute", () => {
    expect(formatShortDuration(MINUTE - 1)).toBe("just now");
  });

  it("returns minutes for values between 1 and 59 minutes", () => {
    expect(formatShortDuration(MINUTE)).toBe("1m");
    expect(formatShortDuration(5 * MINUTE)).toBe("5m");
    expect(formatShortDuration(59 * MINUTE + SECOND * 59)).toBe("59m");
  });

  it("returns hours at the 1-hour boundary", () => {
    expect(formatShortDuration(HOUR)).toBe("1h");
  });

  it("returns hours for values between 1 and 23 hours", () => {
    expect(formatShortDuration(3 * HOUR)).toBe("3h");
    expect(formatShortDuration(23 * HOUR + MINUTE * 59)).toBe("23h");
  });

  it("returns days at the 1-day boundary", () => {
    expect(formatShortDuration(DAY)).toBe("1d");
  });

  it("returns days for large values", () => {
    expect(formatShortDuration(7 * DAY)).toBe("7d");
    expect(formatShortDuration(30 * DAY)).toBe("30d");
  });
});

// ── formatDurationMinutes ─────────────────────────────────────────────────────

describe("formatDurationMinutes", () => {
  it("returns singular minute", () => {
    expect(formatDurationMinutes(1)).toBe("1 minute");
  });

  it("returns plural minutes", () => {
    expect(formatDurationMinutes(15)).toBe("15 minutes");
  });

  it("returns '1 hour' for exactly 60 minutes", () => {
    expect(formatDurationMinutes(60)).toBe("1 hour");
  });

  it("returns plural hours", () => {
    expect(formatDurationMinutes(120)).toBe("2 hours");
    expect(formatDurationMinutes(180)).toBe("3 hours");
  });

  it("returns '1 day' for exactly 1440 minutes", () => {
    expect(formatDurationMinutes(1440)).toBe("1 day");
  });

  it("returns '7 days' for exactly 10080 minutes", () => {
    expect(formatDurationMinutes(10080)).toBe("7 days");
  });

  it("returns plural days for multi-day values", () => {
    expect(formatDurationMinutes(2 * 24 * 60)).toBe("2 days");
    expect(formatDurationMinutes(30 * 24 * 60)).toBe("30 days");
  });

  it("returns '59 minutes' for 59 minutes", () => {
    expect(formatDurationMinutes(59)).toBe("59 minutes");
  });
});

// ── elapsed ───────────────────────────────────────────────────────────────────

describe("elapsed", () => {
  it("returns the difference when now > since", () => {
    expect(elapsed(1000, 500)).toBe(500);
  });

  it("returns zero when now equals since", () => {
    expect(elapsed(1000, 1000)).toBe(0);
  });

  it("clamps to zero when now < since (clock correction / backwards clock)", () => {
    expect(elapsed(500, 1000)).toBe(0);
  });

  it("handles zero values", () => {
    expect(elapsed(0, 0)).toBe(0);
  });

  it("handles large values correctly", () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(elapsed(week, 0)).toBe(week);
  });
});
