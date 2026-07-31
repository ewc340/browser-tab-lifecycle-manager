/** Duration helpers and relative-time formatting. No clock access: `now` is passed in. */

export const SECOND = 1_000;
export const MINUTE = 60 * SECOND;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const minutesToMs = (minutes: number): number => minutes * MINUTE;
export const msToMinutes = (ms: number): number => ms / MINUTE;
export const daysToMs = (days: number): number => days * DAY;

/**
 * Elapsed time, clamped at zero. A backwards clock correction must never produce a
 * negative inactivity value, and a tab must never look older than it is.
 */
export function elapsed(now: number, since: number): number {
  return Math.max(0, now - since);
}

/** Compact relative duration for the tab list: "4m", "3h", "2d". */
export function formatShortDuration(ms: number): string {
  const clamped = Math.max(0, ms);
  if (clamped < MINUTE) return "just now";
  if (clamped < HOUR) return `${Math.floor(clamped / MINUTE)}m`;
  if (clamped < DAY) return `${Math.floor(clamped / HOUR)}h`;
  return `${Math.floor(clamped / DAY)}d`;
}

/** Human phrasing for reasons and settings labels: "1 hour", "7 days", "15 minutes". */
export function formatDurationMinutes(minutes: number): string {
  if (minutes < 60) return plural(Math.round(minutes), "minute");
  if (minutes < 60 * 24) {
    const hours = minutes / 60;
    return plural(Number.isInteger(hours) ? hours : Math.round(hours * 10) / 10, "hour");
  }
  const days = minutes / (60 * 24);
  return plural(Number.isInteger(days) ? days : Math.round(days * 10) / 10, "day");
}

/** Longest sensible unit for an elapsed span, used in activity reasons. */
export function formatElapsedForReason(ms: number): string {
  return formatDurationMinutes(Math.max(1, Math.floor(msToMinutes(ms))));
}

export function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/** Wall-clock time of day, e.g. "9:04 AM", for the activity feed. */
export function formatTimeOfDay(at: number, locale?: string): string {
  return new Date(at).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
}

export function formatDate(at: number, locale?: string): string {
  return new Date(at).toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
