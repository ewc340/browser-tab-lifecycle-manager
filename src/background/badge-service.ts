/**
 * Toolbar badge for pending-close count and paused state.
 */
import * as log from "../shared/log.ts";

export async function updateBadge(options: {
  pendingCloseCount: number;
  automationPaused: boolean;
  closuresLast24h?: number;
}): Promise<void> {
  const { pendingCloseCount, automationPaused } = options;

  try {
    if (automationPaused) {
      await chrome.action.setBadgeText({ text: "‖" });
      await chrome.action.setBadgeBackgroundColor({ color: "#6b7280" });
      return;
    }

    if (pendingCloseCount > 0) {
      const text = pendingCloseCount > 99 ? "99+" : String(pendingCloseCount);
      await chrome.action.setBadgeText({ text });
      await chrome.action.setBadgeBackgroundColor({ color: "#d97706" });
      return;
    }

    await chrome.action.setBadgeText({ text: "" });
  } catch (e) {
    log.warn("updateBadge failed", e);
  }
}
