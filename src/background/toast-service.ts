/**
 * Toast broadcast helpers for manual actions.
 */
import type { ToastPayload } from "../shared/messages.ts";
import { PROTOCOL_VERSION } from "../shared/messages.ts";
import { STRINGS } from "../shared/strings.ts";

let toastCounter = 0;

function nextToastId(): string {
  toastCounter += 1;
  return `toast-${Date.now()}-${toastCounter}`;
}

function emitToast(toast: Omit<ToastPayload, "id">): void {
  chrome.runtime
    .sendMessage({
      v: PROTOCOL_VERSION,
      broadcast: { type: "TOAST", toast: { ...toast, id: nextToastId() } },
    })
    .catch(() => {
      // No panel open — expected.
    });
}

export function toastLockChanged(changed: number, locking: boolean, tabIds: number[]): void {
  if (changed === 0) return;
  emitToast({
    title: locking ? "Tab locked" : "Tab unlocked",
    body: locking ? STRINGS.lock.bulkLocked(changed) : STRINGS.lock.bulkUnlocked(changed),
    tone: "success",
    undo: locking
      ? { type: "UNLOCK_TABS", tabIds }
      : { type: "LOCK_TABS", tabIds },
  });
}

export function toastSleepResult(slept: number, tabIds: number[]): void {
  if (slept === 0) return;
  emitToast({
    title: "Tabs asleep",
    body: STRINGS.sleep.bulkSlept(slept),
    tone: "success",
    undo: { type: "WAKE_TABS", tabIds },
  });
}

export function toastWakeResult(woken: number, tabIds: number[]): void {
  if (woken === 0) return;
  emitToast({
    title: "Tabs woken",
    body: STRINGS.sleep.bulkWoken(woken),
    tone: "info",
    undo: { type: "SLEEP_TABS", tabIds },
  });
}

export function toastCloseResult(closed: number): void {
  if (closed === 0) return;
  emitToast({
    title: "Tabs closed",
    body: STRINGS.close.bulkClosed(closed),
    tone: "info",
  });
}

export function toastKeepLoaded(changed: number, keepLoaded: boolean, tabIds: number[]): void {
  if (changed === 0) return;
  emitToast({
    title: keepLoaded ? "Keep loaded" : "Allow sleeping",
    body: keepLoaded
      ? `${changed} tab${changed === 1 ? "" : "s"} will stay loaded.`
      : `${changed} tab${changed === 1 ? "" : "s"} can sleep again.`,
    tone: "success",
    undo: { type: "SET_KEEP_LOADED", tabIds, keepLoaded: !keepLoaded },
  });
}

export function toastSnoozed(changed: number): void {
  if (changed === 0) return;
  emitToast({
    title: "Tabs snoozed",
    body: `${changed} tab${changed === 1 ? "" : "s"} snoozed for 7 days.`,
    tone: "info",
  });
}

export function toastHostRule(host: string, rule: "NEVER_CLOSE" | "NEVER_SLEEP" | "NONE"): void {
  const body =
    rule === "NEVER_CLOSE"
      ? STRINGS.hostRule.neverCloseSet(host)
      : rule === "NEVER_SLEEP"
        ? STRINGS.hostRule.neverSleepSet(host)
        : STRINGS.hostRule.cleared;
  emitToast({ title: "Site rule updated", body, tone: "info" });
}
