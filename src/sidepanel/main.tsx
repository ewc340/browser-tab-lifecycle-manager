import { createRoot } from "react-dom/client";
import { SIDE_PANEL_TOGGLE_CLOSE, SESSION_KEY_SIDE_PANEL_VISIBLE } from "../shared/messages.ts";
import { App } from "./App.tsx";
import "./styles.css";

void chrome.storage.session.set({ [SESSION_KEY_SIDE_PANEL_VISIBLE]: true });

function markPanelHidden(): void {
  void chrome.storage.session.set({ [SESSION_KEY_SIDE_PANEL_VISIBLE]: false });
}

// Keyboard shortcut toggle: service worker sends close when panel is already open.
chrome.runtime.onMessage.addListener((message) => {
  if (message === SIDE_PANEL_TOGGLE_CLOSE) {
    markPanelHidden();
    setTimeout(() => window.close(), 50);
  }
});

window.addEventListener("pagehide", markPanelHidden);

const root = document.getElementById("root");
if (root === null) throw new Error("Root element not found");

createRoot(root).render(<App />);
