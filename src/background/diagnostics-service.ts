/**
 * Durable diagnostics ring buffer (hostname-redacted).
 */
import type { DiagnosticEntry } from "../shared/types.ts";
import {
  appendDiagnosticEntry,
  formatDiagnosticReport,
} from "../shared/diagnostics.ts";
import { getLocal, setLocal, LOCAL_KEY_DIAGNOSTICS } from "./storage.ts";
import { hostnameOf } from "../shared/sanitize.ts";

async function loadEntries(): Promise<DiagnosticEntry[]> {
  return getLocal<DiagnosticEntry[]>(LOCAL_KEY_DIAGNOSTICS, []);
}

async function saveEntries(entries: DiagnosticEntry[]): Promise<void> {
  await setLocal({ [LOCAL_KEY_DIAGNOSTICS]: entries });
}

export async function recordDiagnostic(
  code: string,
  message: string,
  urlForHost?: string,
): Promise<void> {
  const host =
    urlForHost !== undefined && urlForHost.length > 0
      ? hostnameOf(urlForHost)
      : undefined;
  const entries = appendDiagnosticEntry(await loadEntries(), {
    code,
    message,
    ...(host !== undefined && host.length > 0 ? { host } : {}),
  });
  await saveEntries(entries);
}

export async function getDiagnosticsText(
  extensionVersion: string,
  redaction: "HOSTNAMES" | "FULL",
): Promise<string> {
  const entries = await loadEntries();
  if (redaction === "FULL") {
    return formatDiagnosticReport(entries, extensionVersion);
  }
  return formatDiagnosticReport(
    entries.map((e) => ({ ...e, message: e.message.replace(/https?:\/\/\S+/g, "[url]") })),
    extensionVersion,
  );
}

export async function buildUsageSummary(extensionVersion: string): Promise<string> {
  const { loadSettings } = await import("./settings-service.ts");
  const { loadRuntimeState } = await import("./runtime-state-service.ts");
  const settings = await loadSettings();
  const runtime = await loadRuntimeState();
  return [
    "Browser Tab Lifecycle Manager — usage summary",
    `Version: ${extensionVersion}`,
    `Onboarding completed: ${settings.onboardingCompleted}`,
    `Automation paused: ${settings.automationPaused}`,
    `Sleep enabled: ${settings.sleepEnabled} (${settings.sleepAfterMinutes}m)`,
    `Auto-close enabled: ${settings.autoCloseEnabled} (${settings.closeAfterMinutes}m)`,
    `Report-only until: ${runtime.reportOnlyUntil > Date.now() ? new Date(runtime.reportOnlyUntil).toISOString() : "off"}`,
  ].join("\n");
}
