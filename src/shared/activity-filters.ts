/**
 * Pure activity-feed filter logic (PRD §11.3).
 */
import type { ActivityEvent, ActivityEventType } from "./types.ts";

export type ActivityFilter =
  | "all"
  | "automatic"
  | "manual"
  | "sleep"
  | "close"
  | "protection"
  | "warnings"
  | "errors";

const SLEEP_TYPES = new Set<ActivityEventType>(["TAB_SLEPT", "TABS_SLEPT"]);
const CLOSE_TYPES = new Set<ActivityEventType>([
  "TAB_CLOSED",
  "TAB_CLOSE_SCHEDULED",
  "TAB_CLOSE_CANCELED",
  "TAB_WOULD_CLOSE",
]);
const PROTECTION_TYPES = new Set<ActivityEventType>([
  "TAB_LOCKED",
  "TAB_UNLOCKED",
  "TAB_KEEP_LOADED_CHANGED",
  "TAB_SNOOZED",
  "HOST_RULE_CHANGED",
]);

export function matchesActivityFilter(event: ActivityEvent, filter: ActivityFilter): boolean {
  if (filter === "all") return true;

  switch (filter) {
    case "automatic":
      return event.source.startsWith("AUTOMATIC");
    case "manual":
      return event.source === "MANUAL";
    case "sleep":
      return SLEEP_TYPES.has(event.type);
    case "close":
      return CLOSE_TYPES.has(event.type);
    case "protection":
      return PROTECTION_TYPES.has(event.type);
    case "warnings":
      return event.type === "WARNING";
    case "errors":
      return event.type === "ERROR";
  }
}

export function filterActivityEvents(
  events: readonly ActivityEvent[],
  filter: ActivityFilter,
): ActivityEvent[] {
  if (filter === "all") return [...events];
  return events.filter((event) => matchesActivityFilter(event, filter));
}
