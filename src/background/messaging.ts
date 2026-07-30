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

    // Keep the message channel open for the async response.
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
      return null;
    }

    case "UPDATE_SETTINGS": {
      const settings = await updateSettings(request.patch);
      return { settings };
    }

    case "OPEN_SHORTCUTS_PAGE":
      await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
      return null;

    // ── Not yet implemented (Milestone 1+) ──────────────────────────────────
    // An exhaustive switch (no `default`) means TypeScript will require a new
    // case here whenever a new request type is added to the ExtensionRequest
    // union, preventing silent omissions.
    case "GET_ACTIVITY":
    case "GET_RECOVERY":
    case "LOCK_TABS":
    case "UNLOCK_TABS":
    case "SLEEP_TABS":
    case "WAKE_TABS":
    case "CLOSE_TABS":
    case "SET_KEEP_LOADED":
    case "SNOOZE_TABS":
    case "CANCEL_PENDING_CLOSE":
    case "SET_HOST_RULE":
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

/**
 * Sends a broadcast to all open extension pages (panels, onboarding). The
 * rejection is always swallowed: "Receiving end does not exist" is the normal
 * outcome when no panel is open.
 */
export function broadcast(message: ExtensionBroadcast): void {
  const envelope: BroadcastEnvelope = { v: PROTOCOL_VERSION, broadcast: message };
  chrome.runtime.sendMessage(envelope).catch(() => {
    // No panel open — expected; ignore.
  });
  log.debug("broadcast", message.type);
}
