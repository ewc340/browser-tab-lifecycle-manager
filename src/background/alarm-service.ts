/**
 * Ensures the periodic lifecycle-sweep alarm exists.
 */
import * as log from "../shared/log.ts";

export const LIFECYCLE_ALARM_NAME = "lifecycle-sweep";

const PRODUCTION_PERIOD_MINUTES = 5;
const DEV_PERIOD_MINUTES = 0.5;

function sweepPeriodMinutes(): number {
  return import.meta.env.DEV ? DEV_PERIOD_MINUTES : PRODUCTION_PERIOD_MINUTES;
}

export async function ensureLifecycleAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(LIFECYCLE_ALARM_NAME);
  const periodInMinutes = sweepPeriodMinutes();

  if (existing === undefined) {
    void chrome.alarms.create(LIFECYCLE_ALARM_NAME, { periodInMinutes });
    log.info("created lifecycle alarm", periodInMinutes);
    return;
  }

  if (existing.periodInMinutes !== periodInMinutes) {
    void chrome.alarms.clear(LIFECYCLE_ALARM_NAME);
    void chrome.alarms.create(LIFECYCLE_ALARM_NAME, { periodInMinutes });
    log.info("recreated lifecycle alarm with period", periodInMinutes);
  }
}

export function isLifecycleAlarm(alarm: chrome.alarms.Alarm): boolean {
  return alarm.name === LIFECYCLE_ALARM_NAME;
}
