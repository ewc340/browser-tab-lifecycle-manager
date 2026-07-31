import { createRoot } from "react-dom/client";
import { SIDE_PANEL_TOGGLE_CLOSE } from "../shared/messages.ts";
import { App } from "./App.tsx";
import "./styles.css";

// Keyboard shortcut toggle: service worker calls open() then we close if already open.
chrome.runtime.onMessage.addListener((message) => {
  if (message === SIDE_PANEL_TOGGLE_CLOSE) {
    setTimeout(() => window.close(), 50);
  }
});

const root = document.getElementById("root");
if (root === null) throw new Error("Root element not found");

createRoot(root).render(<App />);
