/**
 * Single source of truth for the manifest. `scripts/build-manifest.mjs` emits
 * `dist/manifest.json` from this, injecting the version from package.json.
 *
 * The product name is imported from `src/shared/product.ts` (DECISIONS.md #1)
 * so renaming the extension is a one-line change in exactly one place.
 */
import { PRODUCT_NAME } from "./src/shared/product.ts";

export const manifest = {
  manifest_version: 3,
  name: PRODUCT_NAME,
  version: "0.0.0", // replaced at build time from package.json
  description:
    "Sleep, protect, and automatically clean up inactive tabs \u2014 with a recoverable history.",

  // 121 is the floor because tabs.Tab.lastAccessed (used to bootstrap activity
  // timestamps) landed in Chrome 121. See DECISIONS.md #7.
  minimum_chrome_version: "121",

  // Makes "never manages incognito tabs" structural rather than a code convention.
  incognito: "not_allowed",

  permissions: [
    "tabs",
    "storage",
    "alarms",
    "sidePanel",
    "contextMenus",
    // Renders site icons from Chrome's local favicon cache instead of fetching
    // remote favIconUrls, which would be an outbound network request per tab.
    "favicon",
  ],

  // `connect-src 'none'` turns "this extension never talks to the network" from a
  // promise into something the browser enforces: fetch, XHR, WebSocket and EventSource
  // from any extension page are blocked outright. Favicons are unaffected because they
  // load as images, not connections.
  content_security_policy: {
    extension_pages: "script-src 'self'; object-src 'self'; connect-src 'none'",
  },

  background: {
    service_worker: "background.js",
    type: "module",
  },

  action: {
    default_title: `Open ${PRODUCT_NAME}`,
    default_icon: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
    },
  },

  side_panel: {
    default_path: "sidepanel.html",
  },

  commands: {
    _execute_action: {
      // Toolbar click only — keyboard shortcut is on open-side-panel so we can call
      // chrome.sidePanel.open() directly (more reliable than _execute_action on Mac).
      description: `Open ${PRODUCT_NAME}`,
    },
    "open-side-panel": {
      suggested_key: { default: "Alt+Shift+T", mac: "Alt+Shift+T" },
      description: `Open ${PRODUCT_NAME} side panel`,
    },
    "toggle-tab-keep": {
      description: "Keep the current tab (protect it from automatic closing)",
    },
  },

  icons: {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png",
  },
} as const;
