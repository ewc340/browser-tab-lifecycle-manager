/**
 * Standalone debug page — open via chrome-extension://&lt;id&gt;/panel-open-debug.html
 * without relying on the keyboard shortcut or toolbar icon.
 */
import {
  SESSION_KEY_NATIVE_SIDE_PANEL_PROVEN,
  SESSION_KEY_SIDE_PANEL_FALLBACK_TAB,
  SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW,
  SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK,
} from "../background/side-panel-service.ts";
import {
  SESSION_KEY_PANEL_OPEN_DEBUG,
  requestPanelOpenFromDebugPage,
} from "../background/panel-open-debug.ts";

const outEl = document.getElementById("out") as HTMLElement;

function renderReport(): void {
  chrome.storage.session.get(
    [
      SESSION_KEY_PANEL_OPEN_DEBUG,
      SESSION_KEY_SIDE_PANEL_PREFER_FALLBACK,
      SESSION_KEY_NATIVE_SIDE_PANEL_PROVEN,
      SESSION_KEY_SIDE_PANEL_FALLBACK_WINDOW,
      SESSION_KEY_SIDE_PANEL_FALLBACK_TAB,
    ],
    (session) => {
      chrome.commands.getAll((commands) => {
        const report = {
          at: new Date().toISOString(),
          extensionId: chrome.runtime.id,
          userAgent: navigator.userAgent,
          urls: {
            sidepanel: chrome.runtime.getURL("sidepanel.html"),
            thisPage: chrome.runtime.getURL("panel-open-debug.html"),
          },
          session,
          commands,
          sidePanelApi: {
            open: typeof chrome.sidePanel.open,
            setOptions: typeof chrome.sidePanel.setOptions,
          },
        };
        outEl.textContent = JSON.stringify(report, null, 2);
      });
    },
  );
}

document.getElementById("refresh")?.addEventListener("click", () => renderReport());

document.getElementById("test-tab")?.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("sidepanel.html"), active: true }, () => {
    renderReport();
  });
});

document.getElementById("test-shortcut-cmd")?.addEventListener("click", () => {
  void requestPanelOpenFromDebugPage().then(() => renderReport());
});

document.getElementById("open-shortcuts-chrome")?.addEventListener("click", () => {
  void chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
});

document.getElementById("open-shortcuts-arc")?.addEventListener("click", () => {
  void chrome.tabs.create({ url: "arc://extensions/shortcuts" });
});

renderReport();
