/**
 * chrome.runtime.onMessage router.
 *
 * Every mutation is run through the task queue for safe read-modify-write.
 * The listener always returns `true` so Chrome keeps the message channel open
 * for the async response. Broadcasts are fire-and-forget with a swallowed
 * rejection because "Receiving end does not exist" is expected when no panel
 * is open.
 */
import type { ExtensionBroadcast, ExtensionRequest, ResponseData } from "../shared/messages.ts";
import {
  PROTOCOL_VERSION,
  isRequestEnvelope,
  type BroadcastEnvelope,
  type ExtensionResponse,
} from "../shared/messages.ts";
import { ExtensionError, toExtensionError } from "../shared/errors.ts";
import * as log from "../shared/log.ts";
import { taskQueue } from "./task-queue.ts";
import { buildAppState } from "./app-state.ts";
import { updateSettings } from "./settings-service.ts";
import { lockTabs, unlockTabs } from "./lock-service.ts";
import {
  closeTabs,
  setHostRule,
  setKeepLoaded,
  sleepTabs,
  snoozeTabs,
  wakeTabs,
} from "./tab-actions.ts";
import {
  toastCloseResult,
  toastHostRule,
  toastKeepLoaded,
  toastLockChanged,
  toastSleepResult,
  toastSnoozed,
  toastWakeResult,
} from "./toast-service.ts";

// ── Message handler ───────────────────────────────────────────────────────────

export function initMessaging(): void {
  chrome.runtime.onMessage.addListener((rawMsg, _sender, sendResponse) => {
    if (!isRequestEnvelope(rawMsg)) {
      const err = new ExtensionError("INVALID_REQUEST", "Message is not a RequestEnvelope");
      sendResponse({ ok: false, error: err.toSerialized(false) } satisfies ExtensionResponse);
      return false;
    }

    if (rawMsg.v !== PROTOCOL_VERSION) {
      const err = new ExtensionError(
        "INVALID_REQUEST",
        `Protocol version mismatch: expected ${PROTOCOL_VERSION}, got ${rawMsg.v}. The panel must reload.`,
      );
      sendResponse({ ok: false, error: err.toSerialized(false) } satisfies ExtensionResponse);
      return false;
    }

    taskQueue
      .push(async () => {
        const data = await route(rawMsg.request);
        sendResponse({ ok: true, data } satisfies ExtensionResponse);
      })
      .catch((e: unknown) => {
        const err = toExtensionError(e);
        sendResponse({
          ok: false,
          error: err.toSerialized(import.meta.env.DEV),
        } satisfies ExtensionResponse);
      });

    return true;
  });
}

// ── Router ────────────────────────────────────────────────────────────────────

async function route(request: ExtensionRequest): Promise<ResponseData[ExtensionRequest["type"]]> {
  const now = Date.now();
  switch (request.type) {
    case "GET_APP_STATE":
      return buildAppState(now);

    case "ACTIVATE_TAB": {
      const tab = await chrome.tabs.get(request.tabId).catch(() => null);
      if (tab === null) throw new ExtensionError("TAB_NOT_FOUND");
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(request.tabId, { active: true });
      broadcast({ type: "APP_STATE_CHANGED" });
      return null;
    }

    case "UPDATE_SETTINGS": {
      const settings = await updateSettings(request.patch);
      broadcast({ type: "SETTINGS_CHANGED" });
      return { settings };
    }

    case "OPEN_SHORTCUTS_PAGE":
      await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
      return null;

    case "LOCK_TABS": {
      const changed = await lockTabs(request.tabIds);
      toastLockChanged(changed, true, request.tabIds);
      broadcast({ type: "APP_STATE_CHANGED" });
      return { changed };
    }

    case "UNLOCK_TABS": {
      const changed = await unlockTabs(request.tabIds);
      toastLockChanged(changed, false, request.tabIds);
      broadcast({ type: "APP_STATE_CHANGED" });
      return { changed };
    }

    case "SLEEP_TABS": {
      const result = await sleepTabs(request.tabIds);
      toastSleepResult(result.slept, request.tabIds);
      broadcast({ type: "APP_STATE_CHANGED" });
      return result;
    }

    case "WAKE_TABS": {
      const result = await wakeTabs(request.tabIds);
      toastWakeResult(result.woken, request.tabIds);
      broadcast({ type: "APP_STATE_CHANGED" });
      return result;
    }

    case "CLOSE_TABS": {
      const result = await closeTabs(request.tabIds);
      toastCloseResult(result.closed);
      broadcast({ type: "APP_STATE_CHANGED" });
      return result;
    }

    case "SET_KEEP_LOADED": {
      const changed = await setKeepLoaded(request.tabIds, request.keepLoaded);
      toastKeepLoaded(changed, request.keepLoaded, request.tabIds);
      broadcast({ type: "APP_STATE_CHANGED" });
      return { changed };
    }

    case "SNOOZE_TABS": {
      const changed = await snoozeTabs(request.tabIds, request.untilMs);
      toastSnoozed(changed);
      broadcast({ type: "APP_STATE_CHANGED" });
      return { changed };
    }

    case "SET_HOST_RULE": {
      const settings = await setHostRule(request.host, request.rule);
      toastHostRule(request.host, request.rule);
      broadcast({ type: "SETTINGS_CHANGED" });
      return { settings };
    }

    // ── Not yet implemented (Milestone 2+) ──────────────────────────────────
    case "GET_ACTIVITY":
    case "GET_RECOVERY":
    case "CANCEL_PENDING_CLOSE":
    case "COMPLETE_ONBOARDING":
    case "PAUSE_AUTOMATION":
    case "RESUME_AUTOMATION":
    case "RESTORE_RECOVERY":
    case "DELETE_RECOVERY":
    case "CLEAR_ACTIVITY":
    case "CLEAR_RECOVERY":
    case "RUN_LIFECYCLE_SWEEP":
    case "EXPORT_DATA":
    case "IMPORT_SETTINGS":
    case "GET_DIAGNOSTICS":
      throw new ExtensionError(
        "INVALID_REQUEST",
        `"${request.type}" arrives in a later milestone`,
      );
  }
}

// ── Broadcast ─────────────────────────────────────────────────────────────────

export function broadcast(message: ExtensionBroadcast): void {
  const envelope: BroadcastEnvelope = { v: PROTOCOL_VERSION, broadcast: message };
  chrome.runtime.sendMessage(envelope).catch(() => {
    // No panel open — expected; ignore.
  });
  log.debug("broadcast", message.type);
}
