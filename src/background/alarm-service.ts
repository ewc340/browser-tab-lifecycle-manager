/**
 * Ensures the periodic lifecycle-sweep alarm exists.
 */
import * as log from "../shared/log.ts";

export const LIFECYCLE_ALARM_NAME = "lifecycle-sweep";
export const THREAD_CLUSTER_ALARM_NAME = "thread-cluster";

const PRODUCTION_PERIOD_MINUTES = 5;
const DEV_PERIOD_MINUTES = 0.5;
const THREAD_CLUSTER_PERIOD_MINUTES = 15;

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

export async function ensureThreadClusterAlarm(): Promise<void> {
  const existing = await chrome.alarms.get(THREAD_CLUSTER_ALARM_NAME);
  const periodInMinutes = THREAD_CLUSTER_PERIOD_MINUTES;

  if (existing === undefined) {
    void chrome.alarms.create(THREAD_CLUSTER_ALARM_NAME, { periodInMinutes });
    log.info("created thread cluster alarm", periodInMinutes);
  }
}

export function isThreadClusterAlarm(alarm: chrome.alarms.Alarm): boolean {
  return alarm.name === THREAD_CLUSTER_ALARM_NAME;
}
