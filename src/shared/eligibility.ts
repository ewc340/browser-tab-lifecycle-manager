/**
 * Classification of what may be done to a tab, and the single state shown for it.
 *
 * Everything here is pure so both the service worker and the panel can call it. The UI
 * must never re-implement these rules: a divergence between what the panel shows and
 * what the sweep does is exactly the kind of bug that destroys trust in automation.
 */
import type {
  LifecycleDisplayState,
  ManagedTabRecord,
  UnavailableReason,
} from "./types.ts";
import { elapsed } from "./time.ts";
import { hostnameOf } from "./sanitize.ts";

/**
 * Schemes the extension must not touch. The PRD lists four; the rest are additions
 * (`about:`, `data:`, `blob:`, `filesystem:`, `chrome-untrusted:`, `chrome-search:`)
 * because they are equally privileged or equally meaningless to reopen.
 */
const PRIVILEGED_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "chrome-untrusted://",
  "chrome-search://",
  "devtools://",
  "view-source:",
  "about:",
  "data:",
  "blob:",
  "filesystem:",
] as const;

/**
 * Empty new tabs. These are the safest possible tabs to close and there is nothing to
 * recover, so they are closeable even though their scheme is privileged.
 */
const NEW_TAB_URLS = new Set([
  "chrome://newtab/",
  "chrome://new-tab-page/",
  "chrome://new-tab-page-third-party/",
  "about:newtab",
  "about:blank",
  "",
]);

const NEW_TAB_TITLES = new Set(["", "new tab", "untitled"]);

export interface ManageabilityInput {
  url: string;
  title?: string | undefined;
  incognito: boolean;
  /** Chrome's window type. Only "normal" windows are ever automated. */
  windowType?: NonNullable<chrome.windows.Window["type"]> | "unknown" | undefined;
}

export interface Manageability {
  /** May be unloaded from memory. */
  canDiscard: boolean;
  /** May be closed automatically. */
  canClose: boolean;
  unavailableReason?: UnavailableReason | undefined;
  /** An empty new-tab page: closeable, but never worth a recovery record. */
  isNewTabPage: boolean;
}

export function classifyManageability(input: ManageabilityInput): Manageability {
  const url = input.url.trim();
  const lowerTitle = (input.title ?? "").trim().toLowerCase();
  // A title is "empty-ish" when it is blank, a known new-tab label, or the URL
  // itself (e.g. Chrome reports about:blank tabs with the title "about:blank").
  const lowerUrl = url.toLowerCase().replace(/\/$/, "");
  const isNewTabPage =
    NEW_TAB_URLS.has(url) &&
    (NEW_TAB_TITLES.has(lowerTitle) || lowerTitle.replace(/\/$/, "") === lowerUrl);

  if (input.incognito) {
    return { canDiscard: false, canClose: false, unavailableReason: "INCOGNITO", isNewTabPage };
  }

  // Popups, app windows, installed PWAs and undocked DevTools are shown for visibility
  // but never automated: closing an OAuth popup mid-flow would be indefensible.
  // Treat "unknown" like normal — Arc and some forks omit window metadata until later.
  if (
    input.windowType !== undefined &&
    input.windowType !== "normal" &&
    input.windowType !== "unknown"
  ) {
    return {
      canDiscard: false,
      canClose: false,
      unavailableReason: "NON_NORMAL_WINDOW",
      isNewTabPage,
    };
  }

  if (url.length === 0) {
    return { canDiscard: false, canClose: true, unavailableReason: undefined, isNewTabPage: true };
  }

  if (isNewTabPage) {
    // Discarding an unloaded blank page saves nothing, so only closing is offered.
    return { canDiscard: false, canClose: true, unavailableReason: undefined, isNewTabPage };
  }

  // Local files are often long-lived notes or reports, and restoring a file:// URL can
  // be blocked unless the user has granted file access, which would make a recovery
  // record that cannot be honoured. Sleeping is safe; closing is not offered.
  if (url.startsWith("file://")) {
    return { canDiscard: true, canClose: false, unavailableReason: "LOCAL_FILE", isNewTabPage };
  }

  if (PRIVILEGED_PREFIXES.some((prefix) => url.startsWith(prefix))) {
    return {
      canDiscard: false,
      canClose: false,
      unavailableReason: "PRIVILEGED_PAGE",
      isNewTabPage,
    };
  }

  return { canDiscard: true, canClose: true, unavailableReason: undefined, isNewTabPage };
}

/** True when no lifecycle action of any kind is available. */
export function isUnavailable(record: Pick<ManagedTabRecord, "canDiscard" | "canClose">): boolean {
  return !record.canDiscard && !record.canClose;
}

/**
 * Display precedence: UNAVAILABLE > ACTIVE > PENDING_CLOSE > IDLE > BACKGROUND.
 *
 * ACTIVE deliberately outranks PENDING_CLOSE (the PRD has it the other way around): a
 * pending closure is cancelled the moment a tab is activated, so showing "closing soon"
 * on the tab the user is currently reading would only ever be a scary display artifact.
 */
export function deriveDisplayState(
  record: Pick<
    ManagedTabRecord,
    "active" | "discarded" | "pendingCloseAt" | "canDiscard" | "canClose"
  >,
  now: number,
): LifecycleDisplayState {
  if (isUnavailable(record)) return "UNAVAILABLE";
  if (record.active) return "ACTIVE";
  if (record.pendingCloseAt !== undefined && record.pendingCloseAt > now) return "PENDING_CLOSE";
  if (record.discarded) return "IDLE";
  return "BACKGROUND";
}

/**
 * Inactivity, excluding time that must not count (e.g. hours the browser was closed).
 * Clamped at zero so a clock correction cannot age a tab.
 */
export function computeInactiveMs(
  record: Pick<ManagedTabRecord, "lastActivatedAt" | "inactivityCreditMs">,
  now: number,
): number {
  return Math.max(0, elapsed(now, record.lastActivatedAt) - record.inactivityCreditMs);
}

/**
 * Host rule matching. Supports an exact hostname and a leading `*.` wildcard, where
 * `*.example.com` also matches the bare `example.com`. Deliberately not a general
 * pattern language: that is a later feature with its own UI.
 */
export function hostMatches(url: string, patterns: readonly string[]): boolean {
  if (patterns.length === 0) return false;
  const host = hostnameOf(url).toLowerCase();
  if (host.length === 0) return false;

  return patterns.some((raw) => {
    const pattern = raw.trim().toLowerCase();
    if (pattern.length === 0) return false;
    if (pattern.startsWith("*.")) {
      const base = pattern.slice(2);
      return host === base || host.endsWith(`.${base}`);
    }
    return host === pattern;
  });
}
