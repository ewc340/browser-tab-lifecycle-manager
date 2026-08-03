/**
 * The typed contract between the side panel and the service worker.
 *
 * The service worker is the only writer of state; the panel only sends requests and
 * renders what it is given. Bulk is the primitive, so a single-tab caller passes a
 * one-element array and there is one code path per operation.
 *
 * Every message carries the protocol version: a panel document can outlive a service
 * worker update, and a stale panel must fail loudly rather than behave oddly.
 */
import type {
  ActivityEvent,
  AppState,
  ExtensionSettings,
  RecoveryRecord,
  RuntimeState,
} from "./types.ts";
import type { ThreadsSnapshot } from "./thread-types.ts";
import type { SerializedError } from "./errors.ts";

export const PROTOCOL_VERSION = 1;

/** Internal signal: side panel should close (used by keyboard toggle). */
export const SIDE_PANEL_TOGGLE_CLOSE = "SIDE_PANEL_TOGGLE_CLOSE" as const;

export type HostRule = "NEVER_CLOSE" | "NEVER_SLEEP" | "NONE";

export type ExtensionRequest =
  | { type: "GET_APP_STATE"; preferCache?: boolean; forceRefresh?: boolean }
  | { type: "GET_ACTIVITY"; cursor?: string; limit?: number }
  | { type: "GET_RECOVERY" }
  | { type: "GET_THREADS"; sinceMs?: number; refreshCapture?: boolean }
  | { type: "ACTIVATE_TAB"; tabId: number }
  | { type: "LOCK_TABS"; tabIds: number[] }
  | { type: "UNLOCK_TABS"; tabIds: number[] }
  | { type: "SLEEP_TABS"; tabIds: number[] }
  | { type: "WAKE_TABS"; tabIds: number[] }
  | { type: "CLOSE_TABS"; tabIds: number[] }
  | { type: "SET_KEEP_LOADED"; tabIds: number[]; keepLoaded: boolean }
  | { type: "SNOOZE_TABS"; tabIds: number[]; untilMs: number }
  | { type: "CANCEL_PENDING_CLOSE"; tabIds: number[] }
  | { type: "SET_HOST_RULE"; host: string; rule: HostRule }
  | { type: "UPDATE_SETTINGS"; patch: Partial<ExtensionSettings> }
  | { type: "COMPLETE_ONBOARDING"; enableAutomation: boolean; reportOnlyDays: number }
  | { type: "PAUSE_AUTOMATION" }
  | { type: "RESUME_AUTOMATION" }
  | { type: "RESTORE_RECOVERY"; recoveryIds: string[]; lock: boolean }
  | { type: "DELETE_RECOVERY"; recoveryIds: string[] }
  | { type: "CLEAR_ACTIVITY" }
  | { type: "CLEAR_RECOVERY" }
  | { type: "RUN_LIFECYCLE_SWEEP" }
  | { type: "EXPORT_DATA"; includeRecovery: boolean }
  | { type: "IMPORT_SETTINGS"; json: string }
  | { type: "GET_DIAGNOSTICS"; redaction: "HOSTNAMES" | "FULL" }
  | { type: "GET_USAGE_SUMMARY" }
  | { type: "DISMISS_WHATS_NEW" }
  | { type: "OPEN_SHORTCUTS_PAGE" };

export type RequestType = ExtensionRequest["type"];

/** Narrows the request union by its `type`. */
export type RequestOf<T extends RequestType> = Extract<ExtensionRequest, { type: T }>;

/** The `data` returned for each request type. */
export interface ResponseData {
  GET_APP_STATE: AppState;
  GET_ACTIVITY: { events: ActivityEvent[]; nextCursor?: string | undefined };
  GET_RECOVERY: { records: RecoveryRecord[] };
  GET_THREADS: ThreadsSnapshot;
  ACTIVATE_TAB: null;
  LOCK_TABS: { changed: number };
  UNLOCK_TABS: { changed: number };
  SLEEP_TABS: { slept: number; failed: number };
  WAKE_TABS: { woken: number; failed: number };
  CLOSE_TABS: { closed: number; failed: number };
  SET_KEEP_LOADED: { changed: number };
  SNOOZE_TABS: { changed: number };
  CANCEL_PENDING_CLOSE: { changed: number };
  SET_HOST_RULE: { settings: ExtensionSettings };
  UPDATE_SETTINGS: { settings: ExtensionSettings };
  COMPLETE_ONBOARDING: { settings: ExtensionSettings };
  PAUSE_AUTOMATION: { settings: ExtensionSettings };
  RESUME_AUTOMATION: { settings: ExtensionSettings; pendingCloseCount: number };
  RESTORE_RECOVERY: { restored: number };
  DELETE_RECOVERY: { deleted: number };
  CLEAR_ACTIVITY: null;
  CLEAR_RECOVERY: null;
  RUN_LIFECYCLE_SWEEP: { slept: number; scheduled: number; closed: number; wouldClose: number };
  EXPORT_DATA: { json: string };
  IMPORT_SETTINGS: { settings: ExtensionSettings };
  GET_DIAGNOSTICS: { text: string };
  GET_USAGE_SUMMARY: { text: string };
  DISMISS_WHATS_NEW: { runtime: RuntimeState };
  OPEN_SHORTCUTS_PAGE: null;
}

export interface ExtensionResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: SerializedError;
}

/** Envelope actually sent over `chrome.runtime.sendMessage`. */
export interface RequestEnvelope {
  v: number;
  request: ExtensionRequest;
}

export interface ToastPayload {
  id: string;
  title: string;
  body?: string | undefined;
  tone: "info" | "success" | "warning" | "error";
  /** The request that reverses this action, when one exists. */
  undo?: ExtensionRequest | undefined;
}

export type ExtensionBroadcast =
  | { type: "APP_STATE_CHANGED" }
  | { type: "SETTINGS_CHANGED" }
  | { type: "ACTIVITY_ADDED"; eventId: string }
  | { type: "SWEEP_COMPLETED"; slept: number; closed: number; scheduled: number }
  | { type: "TOAST"; toast: ToastPayload };

export interface BroadcastEnvelope {
  v: number;
  broadcast: ExtensionBroadcast;
}

export function isRequestEnvelope(value: unknown): value is RequestEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  const req = obj["request"];
  return (
    typeof obj["v"] === "number" &&
    typeof req === "object" &&
    req !== null &&
    typeof (req as Record<string, unknown>)["type"] === "string"
  );
}

export function isBroadcastEnvelope(value: unknown): value is BroadcastEnvelope {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  const bcast = obj["broadcast"];
  return (
    typeof obj["v"] === "number" &&
    typeof bcast === "object" &&
    bcast !== null &&
    typeof (bcast as Record<string, unknown>)["type"] === "string"
  );
}
