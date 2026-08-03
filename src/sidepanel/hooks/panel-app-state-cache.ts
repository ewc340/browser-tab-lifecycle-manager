/**
 * Panel-side AppState snapshot for instant reopen before the service worker responds.
 */
import type { AppState } from "../../shared/types.ts";

export const PANEL_APP_STATE_KEY = "panelAppState:v1";

export async function readPanelAppStateCache(): Promise<AppState | null> {
  try {
    const result = await chrome.storage.session.get(PANEL_APP_STATE_KEY);
    const raw: unknown = result[PANEL_APP_STATE_KEY];
    if (raw === undefined || typeof raw !== "object") return null;
    return raw as AppState;
  } catch {
    return null;
  }
}

export async function writePanelAppStateCache(state: AppState): Promise<void> {
  try {
    await chrome.storage.session.set({ [PANEL_APP_STATE_KEY]: state });
  } catch {
    // Optional optimization — ignore quota or availability errors.
  }
}
