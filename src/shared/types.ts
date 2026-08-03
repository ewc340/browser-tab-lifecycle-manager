/**
 * Data model for the whole extension.
 *
 * Records are versioned at the storage-key level (see background/storage.ts), not
 * per record, so a 1500-tab profile does not pay for a repeated schemaVersion field.
 */

/** The single state shown for a tab. Lock and keep-loaded are separate properties. */
export type LifecycleDisplayState =
  | "ACTIVE"
  | "BACKGROUND"
  | "IDLE"
  | "PENDING_CLOSE"
  | "UNAVAILABLE";

/** Why a tab cannot be fully managed. Rendered verbatim in the panel. */
export type UnavailableReason =
  | "PRIVILEGED_PAGE"
  | "LOCAL_FILE"
  | "NON_NORMAL_WINDOW"
  | "INCOGNITO"
  | "MISSING_URL";

/** Whether a discard was performed by this extension or by Chrome itself. */
export type DiscardedBy = "EXTENSION" | "EXTERNAL";

export interface ManagedTabRecord {
  tabId: number;
  windowId: number;
  index: number;
  /** Chrome's tab-group id, or -1 when ungrouped. Tracked so grouped tabs can be shown. */
  groupId: number;

  url: string;
  /** Identity only. Never used for navigation or restore. */
  normalizedUrl: string;
  title: string;
  favIconUrl?: string | undefined;

  createdAt?: number | undefined;
  firstObservedAt: number;
  lastActivatedAt: number;
  lastUpdatedAt: number;

  active: boolean;
  pinned: boolean;
  audible: boolean;
  discarded: boolean;
  frozen: boolean;
  incognito: boolean;
  status?: `${chrome.tabs.TabStatus}` | undefined;
  /** Chrome's own flag. Set to false by the keep-loaded control. */
  autoDiscardable: boolean;

  /** True until the user has activated this tab at least once. */
  neverActivated: boolean;
  discardedBy?: DiscardedBy | undefined;

  /** Eligible to be unloaded from memory. */
  canDiscard: boolean;
  /** Eligible to be closed automatically. */
  canClose: boolean;
  unavailableReason?: UnavailableReason | undefined;

  /** Protected from automatic closing. */
  closeLocked: boolean;
  lockId?: string | undefined;
  /** Exempt from automatic sleeping, and marked non-discardable to Chrome as well. */
  keepLoaded: boolean;
  /** Hard skip for all automation until this timestamp. */
  snoozedUntil?: number | undefined;

  /**
   * Time that must not count as inactivity, e.g. hours during which the browser was
   * closed. Kept explicit so it is auditable and unit-testable.
   */
  inactivityCreditMs: number;

  pendingCloseAt?: number | undefined;
  pendingCloseScheduledAt?: number | undefined;
  pendingCloseReason?: string | undefined;
  pendingCloseRuleMinutes?: number | undefined;

  /** Set when the tab disappears; the record is purged after the next sweep. */
  removedAt?: number | undefined;
}

export type ThemePreference = "system" | "light" | "dark";

export interface ExtensionSettings {
  schemaVersion: 1;

  onboardingCompleted: boolean;
  automationPaused: boolean;

  sleepEnabled: boolean;
  sleepAfterMinutes: number;

  autoCloseEnabled: boolean;
  closeAfterMinutes: number;
  closeGraceMinutes: number;

  /**
   * When true, a locked tab is also exempt from automatic sleeping. Off by default,
   * matching the PRD: locking protects against closing, not against sleeping.
   */
  lockImpliesKeepLoaded: boolean;

  /** Hostnames that are never slept. Seeded with real-time apps that break when unloaded. */
  neverSleepHosts: string[];
  /** Hostnames that are never closed automatically. */
  neverCloseHosts: string[];

  activityRetentionDays: number;
  recoveryRetentionDays: number;
  maximumActivityEvents: number;
  maximumRecoveryRecords: number;

  /** When false, closures still happen but no URL is written to the recovery list. */
  storeClosedTabUrls: boolean;

  showInPanelToasts: boolean;
  theme: ThemePreference;
}

export interface TabLockRecord {
  lockId: string;
  currentTabId: number;
  url: string;
  normalizedUrl: string;
  windowId: number;
  index: number;
  title: string;
  lockedAt: number;
}

export type ActivityEventType =
  | "TAB_LOCKED"
  | "TAB_UNLOCKED"
  | "TAB_SLEPT"
  | "TABS_SLEPT"
  | "TAB_WOKEN"
  | "TAB_CLOSE_SCHEDULED"
  | "TAB_CLOSE_CANCELED"
  | "TAB_CLOSED"
  | "TAB_WOULD_CLOSE"
  | "TAB_RESTORED"
  | "TAB_KEEP_LOADED_CHANGED"
  | "TAB_SNOOZED"
  | "HOST_RULE_CHANGED"
  | "AUTOMATION_PAUSED"
  | "AUTOMATION_RESUMED"
  | "SETTINGS_CHANGED"
  | "MAINTENANCE"
  | "WARNING"
  | "ERROR";

export type ActivitySource =
  | "MANUAL"
  | "AUTOMATIC_SLEEP"
  | "AUTOMATIC_CLOSE"
  | "AUTOMATIC_REPORT_ONLY"
  | "AUTOMATIC_MAINTENANCE"
  | "SYSTEM";

export interface TabSnapshot {
  tabId?: number | undefined;
  windowId?: number | undefined;
  index?: number | undefined;
  title: string;
  url: string;
}

export interface ActivityEvent {
  id: string;
  type: ActivityEventType;
  occurredAt: number;
  source: ActivitySource;

  message: string;
  reason?: string | undefined;

  /** Capped; `metadata.totalCount` carries the real number for aggregate events. */
  tabs: TabSnapshot[];

  reversible: boolean;
  relatedRecoveryIds?: string[] | undefined;

  metadata?: Record<string, string | number | boolean> | undefined;
}

export interface RecoveryRecord {
  id: string;
  closedAt: number;
  expiresAt: number;

  title: string;
  url: string;

  originalWindowId?: number | undefined;
  originalIndex?: number | undefined;
  originalGroupId?: number | undefined;
  wasPinned?: boolean | undefined;

  lastActivatedAt?: number | undefined;
  closeReason: string;
  closeRuleMinutes: number;

  /** Back-reference so a crash between removal and the activity write can be repaired. */
  activityEventId?: string | undefined;
  /** Set when the user restores this record; drives the restore-rate metric. */
  restoredAt?: number | undefined;
}

/**
 * Durable, URL-keyed activity. Tab ids are session-scoped, so this is what lets an
 * inactivity clock survive a browser restart.
 */
export interface LedgerEntry {
  lastActivatedAt: number;
  firstObservedAt: number;
  neverActivated: boolean;
  snoozedUntil?: number | undefined;
  /** Touched on every read/write so the LRU cap evicts genuinely stale entries. */
  lastSeenAt: number;
}

export interface RuntimeState {
  browserStartedAt: number;
  lastSweepCompletedAt: number;
  lastRetentionRunAt: number;
  /** While in the future, closures are computed and reported but never executed. */
  reportOnlyUntil: number;
  lastKnownVersion: string;
  /** Version that triggered the what's-new banner after an update. */
  whatsNewVersion: string;
  /** Last whats-new version the user dismissed in the panel. */
  whatsNewSeenVersion: string;
}

export interface DiagnosticEntry {
  at: number;
  code: string;
  message: string;
  /** Hostname only, never a full URL. */
  host?: string | undefined;
}

/** A tab as presented to the panel: the record plus everything derived from it. */
export interface TabView extends ManagedTabRecord {
  displayState: LifecycleDisplayState;
  /** Why automation is currently skipping this tab, computed on demand and never stored. */
  skipReason?: string | undefined;
  inactiveMs: number;
}

export interface WindowView {
  windowId: number;
  focused: boolean;
  type: NonNullable<chrome.windows.Window["type"]> | "unknown";
  tabIds: number[];
}

export interface StateCounts {
  total: number;
  active: number;
  background: number;
  idle: number;
  pendingClose: number;
  unavailable: number;
  locked: number;
}

/** The single payload the panel renders from. */
export interface TabInventoryMeta {
  chromiumTabCount: number;
  browserWindowCount: number;
}

export interface AppState {
  extensionVersion: string;
  extensionId: string;
  settings: ExtensionSettings;
  runtime: RuntimeState;
  tabs: TabView[];
  windows: WindowView[];
  counts: StateCounts;
  automationActive: boolean;
  now: number;
  inventory?: TabInventoryMeta;
}
