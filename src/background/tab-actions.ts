/**
 * Manual tab mutations: sleep, wake, close, keep-loaded, snooze, host rules.
 *
 * Every action re-fetches or validates the tab immediately before mutating.
 * Discard results are checked explicitly because Chrome resolves discard() with
 * undefined instead of rejecting for non-discardable tabs.
 */
import type { ExtensionSettings } from "../shared/types.ts";
import { ExtensionError } from "../shared/errors.ts";
import { hostMatches } from "../shared/eligibility.ts";
import { hostnameOf } from "../shared/sanitize.ts";
import { getRecords, patchRecord } from "./tab-repository.ts";
import {
  getSession,
  setSession,
  SESSION_KEY_CLOSING_TAB_IDS,
} from "./storage.ts";
import { loadSettings, updateSettings } from "./settings-service.ts";
import type { HostRule } from "../shared/messages.ts";
import * as log from "../shared/log.ts";

async function getClosingTabIds(): Promise<number[]> {
  return getSession<number[]>(SESSION_KEY_CLOSING_TAB_IDS, []);
}

async function addClosingTabId(tabId: number): Promise<void> {
  const ids = await getClosingTabIds();
  if (!ids.includes(tabId)) {
    await setSession({ [SESSION_KEY_CLOSING_TAB_IDS]: [...ids, tabId] });
  }
}

async function removeClosingTabId(tabId: number): Promise<void> {
  const ids = await getClosingTabIds();
  const next = ids.filter((id) => id !== tabId);
  await setSession({ [SESSION_KEY_CLOSING_TAB_IDS]: next });
}

async function requireRecord(tabId: number) {
  const records = await getRecords();
  const record = records.get(tabId);
  if (record === undefined || record.removedAt !== undefined) {
    throw new ExtensionError("TAB_NOT_FOUND");
  }
  return record;
}

export async function sleepTabs(tabIds: readonly number[]): Promise<{ slept: number; failed: number }> {
  let slept = 0;
  let failed = 0;

  for (const tabId of tabIds) {
    try {
      const record = await requireRecord(tabId);
      if (!record.canDiscard) throw new ExtensionError("TAB_NOT_MANAGEABLE");

      const tab = await chrome.tabs.get(tabId);
      if (tab.active) throw new ExtensionError("TAB_IS_ACTIVE");
      if (tab.discarded) throw new ExtensionError("TAB_ALREADY_DISCARDED");
      if (tab.status === "loading") throw new ExtensionError("TAB_NOT_MANAGEABLE");

      const result = await chrome.tabs.discard(tabId);
      if (result === undefined || result.discarded !== true) {
        throw new ExtensionError("TAB_DISCARD_FAILED");
      }

      await patchRecord(tabId, { discarded: true, discardedBy: "EXTENSION" });
      slept++;
    } catch (e) {
      failed++;
      log.debug("sleepTabs failed for", tabId, e);
    }
  }

  return { slept, failed };
}

export async function wakeTabs(tabIds: readonly number[]): Promise<{ woken: number; failed: number }> {
  let woken = 0;
  let failed = 0;

  for (const tabId of tabIds) {
    try {
      const record = await requireRecord(tabId);
      if (!record.discarded) continue;

      await chrome.tabs.reload(tabId);
      await patchRecord(tabId, { discarded: false, discardedBy: undefined });
      woken++;
    } catch (e) {
      failed++;
      log.debug("wakeTabs failed for", tabId, e);
    }
  }

  return { woken, failed };
}

export async function closeTabs(tabIds: readonly number[]): Promise<{ closed: number; failed: number }> {
  let closed = 0;
  let failed = 0;

  for (const tabId of tabIds) {
    try {
      await requireRecord(tabId);
      await addClosingTabId(tabId);
      await chrome.tabs.remove(tabId);
      closed++;
    } catch (e) {
      await removeClosingTabId(tabId);
      failed++;
      log.debug("closeTabs failed for", tabId, e);
    }
  }

  return { closed, failed };
}

export async function setKeepLoaded(
  tabIds: readonly number[],
  keepLoaded: boolean,
): Promise<number> {
  let changed = 0;

  for (const tabId of tabIds) {
    try {
      const record = await requireRecord(tabId);
      if (!record.canDiscard && keepLoaded) continue;
      if (record.keepLoaded === keepLoaded) continue;

      await chrome.tabs.update(tabId, { autoDiscardable: !keepLoaded });
      await patchRecord(tabId, { keepLoaded, autoDiscardable: !keepLoaded });
      changed++;
    } catch (e) {
      log.debug("setKeepLoaded failed for", tabId, e);
    }
  }

  return changed;
}

export async function snoozeTabs(tabIds: readonly number[], untilMs: number): Promise<number> {
  let changed = 0;

  for (const tabId of tabIds) {
    try {
      const record = await requireRecord(tabId);
      if (record.snoozedUntil === untilMs) continue;
      await patchRecord(tabId, { snoozedUntil: untilMs });
      changed++;
    } catch (e) {
      log.debug("snoozeTabs failed for", tabId, e);
    }
  }

  return changed;
}

export async function setHostRule(host: string, rule: HostRule): Promise<ExtensionSettings> {
  const normalized = host.trim().toLowerCase();
  if (normalized.length === 0) {
    throw new ExtensionError("INVALID_SETTINGS", "Host cannot be empty.");
  }

  const settings = await loadSettings();
  const neverClose = settings.neverCloseHosts.filter((entry) => entry !== normalized);
  const neverSleep = settings.neverSleepHosts.filter((entry) => entry !== normalized);

  if (rule === "NEVER_CLOSE") {
    neverClose.push(normalized);
  } else if (rule === "NEVER_SLEEP") {
    neverSleep.push(normalized);
  }

  return updateSettings({
    neverCloseHosts: neverClose,
    neverSleepHosts: neverSleep,
  });
}

export function hostRuleForTab(
  url: string,
  settings: ExtensionSettings,
): "NEVER_CLOSE" | "NEVER_SLEEP" | "NONE" {
  if (hostMatches(url, settings.neverCloseHosts)) return "NEVER_CLOSE";
  if (hostMatches(url, settings.neverSleepHosts)) return "NEVER_SLEEP";
  return "NONE";
}

export function hostFromTabUrl(url: string): string {
  return hostnameOf(url).toLowerCase();
}
