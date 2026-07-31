/**
 * Stable error codes and their user-facing messages (PRD §28).
 *
 * Chrome runtime errors are converted here so nothing raw reaches the UI: users see a
 * plain sentence, and only development builds see the underlying error.
 */

export const ERROR_CODES = [
  "TAB_NOT_FOUND",
  "TAB_NOT_MANAGEABLE",
  "TAB_IS_ACTIVE",
  "TAB_ALREADY_DISCARDED",
  "TAB_DISCARD_FAILED",
  "TAB_REMOVE_FAILED",
  "RECOVERY_NOT_FOUND",
  "WINDOW_NOT_FOUND",
  "STORAGE_READ_FAILED",
  "STORAGE_WRITE_FAILED",
  "STORAGE_QUOTA_EXCEEDED",
  "INVALID_SETTINGS",
  "INVALID_REQUEST",
  "AUTOMATION_PAUSED",
  "UNKNOWN_ERROR",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const MESSAGES: Record<ErrorCode, string> = {
  TAB_NOT_FOUND: "That tab is no longer open.",
  TAB_NOT_MANAGEABLE: "This extension cannot manage that tab.",
  TAB_IS_ACTIVE: "The tab you are currently viewing cannot be put to sleep.",
  TAB_ALREADY_DISCARDED: "That tab is already asleep.",
  TAB_DISCARD_FAILED: "Chrome could not put this tab to sleep.",
  TAB_REMOVE_FAILED: "Chrome could not close this tab.",
  RECOVERY_NOT_FOUND: "That recovery record no longer exists.",
  WINDOW_NOT_FOUND: "That window is no longer open.",
  STORAGE_READ_FAILED: "Saved data could not be read.",
  STORAGE_WRITE_FAILED: "Changes could not be saved.",
  STORAGE_QUOTA_EXCEEDED: "Local storage is full. Clear some history to continue.",
  INVALID_SETTINGS: "Those settings are not valid.",
  INVALID_REQUEST: "That request was not understood.",
  AUTOMATION_PAUSED: "Automatic management is paused.",
  UNKNOWN_ERROR: "Something went wrong.",
};

export interface SerializedError {
  code: ErrorCode;
  message: string;
  /** Development builds only; never populated in a production build. */
  detail?: string | undefined;
}

export class ExtensionError extends Error {
  readonly code: ErrorCode;
  readonly detail: string | undefined;

  constructor(code: ErrorCode, detail?: string, messageOverride?: string) {
    super(messageOverride ?? MESSAGES[code]);
    this.name = "ExtensionError";
    this.code = code;
    this.detail = detail;
  }

  toSerialized(includeDetail: boolean): SerializedError {
    return {
      code: this.code,
      message: this.message,
      detail: includeDetail ? this.detail : undefined,
    };
  }
}

export function messageForCode(code: ErrorCode): string {
  return MESSAGES[code];
}

/** Wraps anything thrown into an ExtensionError, defaulting to `fallback`. */
export function toExtensionError(
  cause: unknown,
  fallback: ErrorCode = "UNKNOWN_ERROR",
): ExtensionError {
  if (cause instanceof ExtensionError) return cause;

  const detail =
    cause instanceof Error ? cause.message : typeof cause === "string" ? cause : undefined;

  if (detail !== undefined) {
    const lower = detail.toLowerCase();
    if (lower.includes("no tab with id") || lower.includes("no tab with the id")) {
      return new ExtensionError("TAB_NOT_FOUND", detail);
    }
    if (lower.includes("no window with id")) {
      return new ExtensionError("WINDOW_NOT_FOUND", detail);
    }
    if (lower.includes("quota")) {
      return new ExtensionError("STORAGE_QUOTA_EXCEEDED", detail);
    }
  }

  return new ExtensionError(fallback, detail);
}

export function isQuotaError(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /quota|QUOTA_BYTES/i.test(message);
}
