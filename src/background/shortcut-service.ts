/**
 * Shortcut assignment helpers for browsers that ignore manifest suggested_key.
 */
import { recordPanelOpenEvent } from "./panel-open-debug.ts";

export function shortcutsPageUrl(): string {
  return "chrome://extensions/shortcuts";
}

export function arcShortcutsPageUrl(): string {
  return "arc://extensions/shortcuts";
}

export function hasPanelOpenShortcut(commands: chrome.commands.Command[]): boolean {
  return commands.some(
    (command) =>
      (command.name === "open-side-panel" || command.name === "_execute_action") &&
      (command.shortcut?.length ?? 0) > 0,
  );
}

export function maybePromptShortcutAssignment(): void {
  chrome.commands.getAll((commands) => {
    if (hasPanelOpenShortcut(commands)) return;

    recordPanelOpenEvent(
      "shortcuts_unassigned",
      "no shortcut bound — opening shortcuts settings",
    );
    chrome.tabs.create({ url: arcShortcutsPageUrl() }, () => {
      if (chrome.runtime.lastError) {
        void chrome.tabs.create({ url: shortcutsPageUrl() });
      }
    });
  });
}
