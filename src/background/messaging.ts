/**
 * chrome.runtime.onMessage router.
 */
import type { ExtensionBroadcast, ExtensionRequest, ResponseData } from "../shared/messages.ts";
import {
  PROTOCOL_VERSION,
  isRequestEnvelope,
  type BroadcastEnvelope,
  type ExtensionResponse,
} from "../shared/messages.ts";
import { ExtensionError, toExtensionError } from "../shared/errors.ts";
import { reanchorPendingClose } from "../shared/lifecycle.ts";
import * as log from "../shared/log.ts";
import { taskQueue } from "./task-queue.ts";
import { buildAppState } from "./app-state.ts";
import { updateSettings, loadSettings } from "./settings-service.ts";
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
import { getActivityPage, clearAllActivity } from "./activity-service.ts";
import {
  listRecoveryRecords,
  restoreRecoveryRecords,
  deleteRecoveryRecords,
  clearAllRecoveryRecords,
} from "./recovery-service.ts";
import { getDiagnosticsText, buildUsageSummary } from "./diagnostics-service.ts";
import { exportExtensionData, importSettingsFromJson } from "./data-export-service.ts";
import { loadRuntimeState, saveRuntimeState } from "./runtime-state-service.ts";
import { completeOnboarding } from "./reconciliation-service.ts";
import {
  cancelPendingCloseForTabs,
  pauseAutomation,
  resumeAutomation,
  runLifecycleSweep,
} from "./lifecycle-sweep.ts";
import { getRecords, putRecords } from "./tab-repository.ts";

const INTERACTIVE_REQUESTS = new Set<ExtensionRequest["type"]>([
  "GET_APP_STATE",
  "GET_ACTIVITY",
  "GET_RECOVERY",
  "GET_DIAGNOSTICS",
  "GET_USAGE_SUMMARY",
  "EXPORT_DATA",
]);

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

    const enqueue = INTERACTIVE_REQUESTS.has(rawMsg.request.type)
      ? taskQueue.pushInteractive.bind(taskQueue)
      : taskQueue.push.bind(taskQueue);

    enqueue(async () => {
      const data = await route(rawMsg.request);
      sendResponse({ ok: true, data } satisfies ExtensionResponse);
    }).catch((e: unknown) => {
      const err = toExtensionError(e);
      sendResponse({
        ok: false,
        error: err.toSerialized(import.meta.env.DEV),
      } satisfies ExtensionResponse);
    });

    return true;
  });
}

async function route(request: ExtensionRequest): Promise<ResponseData[ExtensionRequest["type"]]> {
  const now = Date.now();
  switch (request.type) {
    case "GET_APP_STATE":
      return buildAppState(now);

    case "GET_ACTIVITY": {
      const page = await getActivityPage(request.cursor, request.limit ?? 50);
      return page;
    }

    case "GET_RECOVERY":
      return { records: await listRecoveryRecords() };

    case "ACTIVATE_TAB": {
      const tab = await chrome.tabs.get(request.tabId).catch(() => null);
      if (tab === null) throw new ExtensionError("TAB_NOT_FOUND");
      await chrome.windows.update(tab.windowId, { focused: true });
      await chrome.tabs.update(request.tabId, { active: true });
      await cancelPendingCloseForTabs([request.tabId]);
      broadcast({ type: "APP_STATE_CHANGED" });
      return null;
    }

    case "UPDATE_SETTINGS": {
      const previous = await loadSettings();
      const settings = await updateSettings(request.patch);

      if (
        request.patch.closeGraceMinutes !== undefined &&
        request.patch.closeGraceMinutes !== previous.closeGraceMinutes
      ) {
        const records = await getRecords();
        let changed = false;
        for (const [tabId, record] of records) {
          if (record.pendingCloseScheduledAt === undefined) continue;
          const pendingCloseAt = reanchorPendingClose(
            record,
            settings.closeGraceMinutes,
            now,
          );
          if (pendingCloseAt !== record.pendingCloseAt) {
            records.set(tabId, { ...record, pendingCloseAt });
            changed = true;
          }
        }
        if (changed) await putRecords(records);
      }

      await runLifecycleSweep({ trigger: "settings" });
      broadcast({ type: "SETTINGS_CHANGED" });
      return { settings };
    }

    case "OPEN_SHORTCUTS_PAGE":
      await chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
      return null;

    case "LOCK_TABS": {
      const changed = await lockTabs(request.tabIds);
      await cancelPendingCloseForTabs(request.tabIds);
      await runLifecycleSweep({ trigger: "lock" });
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
      await runLifecycleSweep({ trigger: "keep-loaded" });
      toastKeepLoaded(changed, request.keepLoaded, request.tabIds);
      broadcast({ type: "APP_STATE_CHANGED" });
      return { changed };
    }

    case "SNOOZE_TABS": {
      const changed = await snoozeTabs(request.tabIds, request.untilMs);
      await cancelPendingCloseForTabs(request.tabIds);
      await runLifecycleSweep({ trigger: "snooze" });
      toastSnoozed(changed);
      broadcast({ type: "APP_STATE_CHANGED" });
      return { changed };
    }

    case "SET_HOST_RULE": {
      const settings = await setHostRule(request.host, request.rule);
      await runLifecycleSweep({ trigger: "host-rule" });
      toastHostRule(request.host, request.rule);
      broadcast({ type: "SETTINGS_CHANGED" });
      return { settings };
    }

    case "CANCEL_PENDING_CLOSE": {
      const changed = await cancelPendingCloseForTabs(request.tabIds);
      broadcast({ type: "APP_STATE_CHANGED" });
      return { changed };
    }

    case "COMPLETE_ONBOARDING": {
      await completeOnboarding(request.enableAutomation, request.reportOnlyDays);
      const settings = await loadSettings();
      broadcast({ type: "SETTINGS_CHANGED" });
      broadcast({ type: "APP_STATE_CHANGED" });
      return { settings };
    }

    case "PAUSE_AUTOMATION": {
      await pauseAutomation();
      const settings = await loadSettings();
      broadcast({ type: "SETTINGS_CHANGED" });
      broadcast({ type: "APP_STATE_CHANGED" });
      return { settings };
    }

    case "RESUME_AUTOMATION": {
      const { pendingCloseCount } = await resumeAutomation();
      const settings = await loadSettings();
      broadcast({ type: "SETTINGS_CHANGED" });
      broadcast({ type: "APP_STATE_CHANGED" });
      return { settings, pendingCloseCount };
    }

    case "RUN_LIFECYCLE_SWEEP": {
      const summary = await runLifecycleSweep({ trigger: "manual" });
      return summary;
    }

    case "RESTORE_RECOVERY": {
      const restored = await restoreRecoveryRecords(request.recoveryIds, request.lock);
      broadcast({ type: "APP_STATE_CHANGED" });
      return { restored };
    }

    case "DELETE_RECOVERY": {
      const deleted = await deleteRecoveryRecords(request.recoveryIds);
      return { deleted };
    }

    case "CLEAR_ACTIVITY": {
      await clearAllActivity();
      return null;
    }

    case "CLEAR_RECOVERY": {
      await clearAllRecoveryRecords();
      return null;
    }

    case "EXPORT_DATA": {
      const json = await exportExtensionData(request.includeRecovery);
      return { json };
    }

    case "IMPORT_SETTINGS": {
      const settings = await importSettingsFromJson(request.json);
      broadcast({ type: "SETTINGS_CHANGED" });
      return { settings };
    }

    case "GET_DIAGNOSTICS": {
      const { version } = chrome.runtime.getManifest();
      const text = await getDiagnosticsText(version, request.redaction);
      return { text };
    }

    case "GET_USAGE_SUMMARY": {
      const { version } = chrome.runtime.getManifest();
      const text = await buildUsageSummary(version);
      return { text };
    }

    case "DISMISS_WHATS_NEW": {
      const runtime = await loadRuntimeState();
      runtime.whatsNewSeenVersion = runtime.whatsNewVersion;
      await saveRuntimeState(runtime);
      return { runtime };
    }
  }
}

export function broadcast(message: ExtensionBroadcast): void {
  const envelope: BroadcastEnvelope = { v: PROTOCOL_VERSION, broadcast: message };
  chrome.runtime.sendMessage(envelope).catch(() => {});
  log.debug("broadcast", message.type);
}

export async function extendReportOnly(days: number): Promise<void> {
  const runtime = await loadRuntimeState();
  const now = Date.now();
  runtime.reportOnlyUntil = Math.max(runtime.reportOnlyUntil, now) + days * 24 * 60 * 60 * 1000;
  await saveRuntimeState(runtime);
  await runLifecycleSweep({ trigger: "report-only-extend" });
}

export async function disableReportOnly(): Promise<void> {
  const runtime = await loadRuntimeState();
  runtime.reportOnlyUntil = 0;
  await saveRuntimeState(runtime);
  await runLifecycleSweep({ trigger: "report-only-off" });
}
