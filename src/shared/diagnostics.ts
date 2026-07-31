/**
 * Diagnostics ring buffer — pure logic tested without chrome.storage.
 */
import type { DiagnosticEntry } from "./types.ts";
import { hostnameOf } from "./sanitize.ts";

export const DIAGNOSTIC_CAP = 200;

export function appendDiagnosticEntry(
  entries: DiagnosticEntry[],
  partial: Omit<DiagnosticEntry, "at"> & { at?: number },
): DiagnosticEntry[] {
  const entry: DiagnosticEntry = {
    at: partial.at ?? Date.now(),
    code: partial.code,
    message: partial.message,
    host: partial.host,
  };
  return [entry, ...entries].slice(0, DIAGNOSTIC_CAP);
}

export function redactDiagnosticUrl(url: string): string {
  const host = hostnameOf(url);
  return host.length > 0 ? host : "[unknown host]";
}

export function formatDiagnosticReport(
  entries: readonly DiagnosticEntry[],
  extensionVersion: string,
): string {
  const lines = [
    `Browser Tab Lifecycle Manager diagnostic report`,
    `Version: ${extensionVersion}`,
    `Entries: ${entries.length}`,
    "",
  ];
  for (const entry of entries) {
    const host = entry.host !== undefined ? ` (${entry.host})` : "";
    lines.push(`${new Date(entry.at).toISOString()} [${entry.code}]${host} ${entry.message}`);
  }
  return lines.join("\n");
}
