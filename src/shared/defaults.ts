/**
 * Default settings, safety invariants, and settings validation.
 *
 * Two things here resolve contradictions in the PRD:
 *
 * 1. Automation ships OFF. The PRD's DEFAULT_SETTINGS enables sleeping and closing while
 *    the surrounding text requires both to be off until the user clicks "Enable automatic
 *    management". Implemented literally, a fresh install would close tabs after seven days
 *    with no consent, which is the exact failure the product exists to avoid.
 * 2. The always-on exclusions (active/pinned/audible, and locked-when-closing) are
 *    compile-time constants rather than settings. The PRD types them as the literal
 *    `true` but also puts them in a `Partial<ExtensionSettings>` patch, which is a way for
 *    a future refactor to silently weaken a safety guarantee.
 */
import type { ExtensionSettings } from "./types.ts";

/**
 * Non-negotiable exclusions, surfaced in Settings as static rows. Not settings, so no
 * message, migration, or refactor can turn them off.
 */
export const SAFETY_INVARIANTS = {
  skipActiveTabs: true,
  skipPinnedTabs: true,
  skipAudibleTabs: true,
  skipLockedTabsWhenClosing: true,
} as const;

/**
 * Hosts that are never slept by default. Discarding a tab tears down its WebSockets and
 * discards unsaved input, which for these sites means missed notifications or a lost
 * draft. Users can edit this list.
 */
export const DEFAULT_NEVER_SLEEP_HOSTS: readonly string[] = [
  "mail.google.com",
  "calendar.google.com",
  "docs.google.com",
  "meet.google.com",
  "*.slack.com",
  "discord.com",
  "teams.microsoft.com",
  "*.zoom.us",
  "web.whatsapp.com",
  "messages.google.com",
  "localhost",
];

export const DEFAULT_SETTINGS: ExtensionSettings = {
  schemaVersion: 1,

  // Nothing automatic happens until the user opts in from the onboarding page.
  onboardingCompleted: false,
  automationPaused: false,

  sleepEnabled: false,
  sleepAfterMinutes: 60,

  autoCloseEnabled: false,
  closeAfterMinutes: 7 * 24 * 60,
  closeGraceMinutes: 10,

  lockImpliesKeepLoaded: false,

  neverSleepHosts: [...DEFAULT_NEVER_SLEEP_HOSTS],
  neverCloseHosts: [],

  activityRetentionDays: 30,
  recoveryRetentionDays: 30,
  maximumActivityEvents: 1000,
  maximumRecoveryRecords: 500,

  storeClosedTabUrls: true,

  showInPanelToasts: true,
  theme: "system",
};

/** Values written by the onboarding page when the user enables automatic management. */
export const ONBOARDING_ENABLED_SETTINGS = {
  onboardingCompleted: true,
  sleepEnabled: true,
  autoCloseEnabled: true,
} as const satisfies Partial<ExtensionSettings>;

/** Development-only fast lifecycle. Never reachable from a production build. */
export const DEV_FAST_LIFECYCLE = {
  sleepAfterMinutes: 1,
  closeAfterMinutes: 2,
  closeGraceMinutes: 1,
} as const;

export interface NumericRange {
  min: number;
  max: number;
}

/**
 * Legal ranges. The PRD offers a "Custom" duration with no bounds anywhere, which makes
 * "close every background tab within five minutes" a reachable configuration.
 */
export const SETTINGS_RANGES = {
  sleepAfterMinutes: { min: 5, max: 30 * 24 * 60 },
  closeAfterMinutes: { min: 60, max: 365 * 24 * 60 },
  closeGraceMinutes: { min: 1, max: 24 * 60 },
  activityRetentionDays: { min: 1, max: 365 },
  recoveryRetentionDays: { min: 1, max: 365 },
  maximumActivityEvents: { min: 50, max: 5000 },
  maximumRecoveryRecords: { min: 50, max: 2000 },
} as const satisfies Record<string, NumericRange>;

export type RangedSettingKey = keyof typeof SETTINGS_RANGES;

const THEMES = new Set<ExtensionSettings["theme"]>(["system", "light", "dark"]);

export interface SettingsValidationResult {
  settings: ExtensionSettings;
  /** Human-readable problems. Non-empty means the caller should reject the patch. */
  problems: string[];
}

/**
 * Coerces unknown storage content into valid settings, filling missing fields from the
 * defaults. Used for both first install and schema migration, so corrupt or partial data
 * degrades to safe defaults rather than throwing.
 */
export function normalizeSettings(input: unknown): SettingsValidationResult {
  const problems: string[] = [];
  const source = isRecord(input) ? input : {};
  if (!isRecord(input) && input !== undefined && input !== null) {
    problems.push("Settings were not an object; defaults were restored.");
  }

  const settings: ExtensionSettings = {
    ...DEFAULT_SETTINGS,
    schemaVersion: 1,

    onboardingCompleted: bool(source.onboardingCompleted, DEFAULT_SETTINGS.onboardingCompleted),
    automationPaused: bool(source.automationPaused, DEFAULT_SETTINGS.automationPaused),

    sleepEnabled: bool(source.sleepEnabled, DEFAULT_SETTINGS.sleepEnabled),
    sleepAfterMinutes: number(source.sleepAfterMinutes, "sleepAfterMinutes", problems),

    autoCloseEnabled: bool(source.autoCloseEnabled, DEFAULT_SETTINGS.autoCloseEnabled),
    closeAfterMinutes: number(source.closeAfterMinutes, "closeAfterMinutes", problems),
    closeGraceMinutes: number(source.closeGraceMinutes, "closeGraceMinutes", problems),

    lockImpliesKeepLoaded: bool(
      source.lockImpliesKeepLoaded,
      DEFAULT_SETTINGS.lockImpliesKeepLoaded,
    ),

    neverSleepHosts: hostList(source.neverSleepHosts, DEFAULT_SETTINGS.neverSleepHosts),
    neverCloseHosts: hostList(source.neverCloseHosts, DEFAULT_SETTINGS.neverCloseHosts),

    activityRetentionDays: number(source.activityRetentionDays, "activityRetentionDays", problems),
    recoveryRetentionDays: number(source.recoveryRetentionDays, "recoveryRetentionDays", problems),
    maximumActivityEvents: number(source.maximumActivityEvents, "maximumActivityEvents", problems),
    maximumRecoveryRecords: number(
      source.maximumRecoveryRecords,
      "maximumRecoveryRecords",
      problems,
    ),

    storeClosedTabUrls: bool(source.storeClosedTabUrls, DEFAULT_SETTINGS.storeClosedTabUrls),

    showInPanelToasts: bool(source.showInPanelToasts, DEFAULT_SETTINGS.showInPanelToasts),
    theme: THEMES.has(source.theme as ExtensionSettings["theme"])
      ? (source.theme as ExtensionSettings["theme"])
      : DEFAULT_SETTINGS.theme,
  };

  // "Sleep before closing" is only reachable when the close threshold is the later of
  // the two, so an inverted pair is corrected rather than honoured.
  if (settings.closeAfterMinutes < settings.sleepAfterMinutes) {
    problems.push(
      "The close threshold must be at least the sleep threshold; it was raised to match.",
    );
    settings.closeAfterMinutes = Math.max(
      settings.sleepAfterMinutes,
      SETTINGS_RANGES.closeAfterMinutes.min,
    );
  }

  return { settings, problems };
}

/**
 * Validates a user-supplied patch. Out-of-range values are reported instead of silently
 * clamped so the UI can explain what was wrong.
 */
export function validateSettingsPatch(patch: Record<string, unknown>): string[] {
  const problems: string[] = [];

  for (const key of Object.keys(patch)) {
    if (!(key in DEFAULT_SETTINGS)) {
      problems.push(`Unknown setting "${key}".`);
    }
  }

  for (const [key, range] of Object.entries(SETTINGS_RANGES) as [RangedSettingKey, NumericRange][]) {
    const value = patch[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      problems.push(`${key} must be a number.`);
    } else if (value < range.min || value > range.max) {
      problems.push(`${key} must be between ${range.min} and ${range.max}.`);
    }
  }

  const sleepAfter = patch.sleepAfterMinutes;
  const closeAfter = patch.closeAfterMinutes;
  if (typeof sleepAfter === "number" && typeof closeAfter === "number" && closeAfter < sleepAfter) {
    problems.push("The close threshold cannot be shorter than the sleep threshold.");
  }

  return problems;
}

/** True when automatic actions may run at all. */
export function isAutomationActive(settings: ExtensionSettings): boolean {
  return settings.onboardingCompleted && !settings.automationPaused;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function number(value: unknown, key: RangedSettingKey, problems: string[]): number {
  const range = SETTINGS_RANGES[key];
  const fallback = DEFAULT_SETTINGS[key];
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  if (value < range.min || value > range.max) {
    problems.push(`${key} was out of range and reset to ${fallback}.`);
    return fallback;
  }
  return value;
}

function hostList(value: unknown, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const hosts = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0 && entry.length < 254);
  return [...new Set(hosts)];
}
