/**
 * Panel-open diagnostics persisted to session storage (survives production builds).
 */
import { recordDiagnostic } from "./diagnostics-service.ts";
import { setSession } from "./storage.ts";

export const SESSION_KEY_PANEL_OPEN_DEBUG = "panelOpenDebug:v1";

export interface PanelOpenEvent {
  at: number;
  source: string;
  detail?: string;
  error?: string;
}

const MAX_EVENTS = 50;

export function recordPanelOpenEvent(source: string, detail?: string, error?: string): void {
  const entry: PanelOpenEvent = {
    at: Date.now(),
    source,
    ...(detail !== undefined && detail.length > 0 ? { detail } : {}),
    ...(error !== undefined && error.length > 0 ? { error } : {}),
  };

  void chrome.storage.session.get(SESSION_KEY_PANEL_OPEN_DEBUG, (result) => {
    const events = (result[SESSION_KEY_PANEL_OPEN_DEBUG] as PanelOpenEvent[] | undefined) ?? [];
    events.push(entry);
    void setSession({ [SESSION_KEY_PANEL_OPEN_DEBUG]: events.slice(-MAX_EVENTS) });
  });

  const diagnosticMessage = error ?? detail ?? "ok";
  void recordDiagnostic(`panel_open:${source}`, diagnosticMessage);
}

/** Debug page triggers the same open path as the keyboard shortcut. */
export async function requestPanelOpenFromDebugPage(): Promise<void> {
  recordPanelOpenEvent("debug_page", "simulate shortcut");
  const { openSidePanelFromUserGesture } = await import("./side-panel-service.ts");
  openSidePanelFromUserGesture();
}

export function initPanelOpenDiagnostics(): void {
  recordPanelOpenEvent(
    "sw_boot",
    `sidePanel.open=${typeof chrome.sidePanel.open} sidePanel.setOptions=${typeof chrome.sidePanel.setOptions}`,
  );

  chrome.commands.getAll((commands) => {
    const summary = commands
      .map((command) => `${command.name ?? "?"}=${command.shortcut ?? "(none)"}`)
      .join(", ");
    recordPanelOpenEvent("commands_getAll", summary);
  });
}
