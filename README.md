# Browser Tab Lifecycle Manager

A Chrome (Manifest V3) extension that automatically manages tab clutter and memory use via sleeping (discarding) and grace-period closure, with per-tab protection, a recoverable closure history, and a transparent activity feed. Local-first: no accounts, no backend, no network calls, no telemetry.

**Status: Milestone 3 complete.** Automated lifecycle, activity feed, recovery restore, and diagnostics are implemented. Milestone 4 adds stabilization tests, migrations, and CI.

---

## Install for local use

1. `npm install`
2. `npm run build`
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `dist/` folder.

Chrome 121 or later is required. The floor comes from `tabs.Tab.lastAccessed`, which the extension uses to bootstrap each tab's activity timestamp; on older versions inactivity tracking would silently misbehave.

---

## Install on another computer

To use the extension on a different machine without cloning the repo:

1. **Build the zip** (on any machine with Node.js 22+):
   ```bash
   npm install
   npm run package
   ```
   This creates `browser-tab-lifecycle-manager-0.1.0.zip` in the project root (version matches `package.json`).

2. **Transfer the zip** to the other device (USB drive, cloud storage, GitHub Releases, or the `dist-zip` artifact from CI).

3. **Install in Chrome** on the target machine:
   - Unzip the archive to a folder (e.g. `browser-tab-lifecycle-manager/`).
   - Open `chrome://extensions`, enable **Developer mode**.
   - Click **Load unpacked** and select the unzipped folder (the one containing `manifest.json`).

   Chrome does not install `.zip` files directly for unpacked extensions — you must extract first.

4. **Pin the extension** and use **Alt+Shift+T** (or the toolbar icon) to open the side panel.

For teammates, you can also share a [GitHub Release](https://github.com/ewc340/browser-tab-lifecycle-manager/releases) asset or download the CI artifact from a green build on `main`.

---

## Other Chromium browsers (Brave, Arc, Edge, etc.)

This is a **Manifest V3** extension with no Chrome-only APIs beyond standard Chromium extension surfaces (`sidePanel`, `tabs`, `storage`, `alarms`). It is **not** published to a store yet, so every browser uses the same **Load unpacked** flow as Chrome.

**Supported target:** Chromium desktop **121+** (same as Chrome — see `minimum_chrome_version` in the manifest).

### 1. Build or obtain the extension folder

Same as above:

```bash
npm run package
```

Unzip `browser-tab-lifecycle-manager-0.1.0.zip`, or use the `dist/` folder from `npm run build`. You need a directory that contains `manifest.json`.

### 2. Open that browser’s extensions page

| Browser | Extensions URL |
| --- | --- |
| Google Chrome | `chrome://extensions` |
| Brave | `brave://extensions` |
| Microsoft Edge | `edge://extensions` |
| Arc | `arc://extensions` |
| Chromium (generic) | `chrome://extensions` |

Enable **Developer mode** (or the equivalent toggle).

### 3. Load unpacked

Click **Load unpacked** (Edge may label it **Load extension**) and select the folder with `manifest.json`.

### 4. Open the lifecycle manager

- Use the extension toolbar icon, or
- Set / use the keyboard shortcut (`Alt+Shift+T` is suggested in the manifest; configure under **Extension shortcuts** on that browser’s extensions page).

**Arc:** Arc does not support Chrome’s native side panel API. On Arc, the extension opens the manager in a **new browser tab** instead. After updating, reload the extension at `arc://extensions`, then use **Alt+Shift+T** or the toolbar icon.

If the shortcut does nothing:

1. Open `arc://extensions/shortcuts`
2. Find **Browser Tab Lifecycle Manager**
3. Assign **Open Browser Tab Lifecycle Manager side panel** to `Alt+Shift+T` (Arc does not always apply manifest shortcuts automatically)
4. If that entry is blank, assign **Open Browser Tab Lifecycle Manager** (`_execute_action`) instead — both should open the manager

### Debugging panel open on Arc

Production builds do not log to the console. Use the **panel open debug page** instead:

1. Open `arc://extensions` and copy the extension **ID** (32-character string).
2. In Arc’s address bar, open:
   `chrome-extension://YOUR_EXTENSION_ID/panel-open-debug.html`
   (Arc may also accept the same `chrome-extension://` scheme — try it first.)
3. Click **Refresh report**, then try **Test: open manager tab** and **Test: simulate shortcut handler**.
4. Copy the full JSON report and share it in a GitHub issue or with whoever is debugging.

The report includes registered keyboard shortcuts, session fallback flags, and a chronological event log (`panelOpenDebug:v1`).

**Also helpful when reporting:**

| What | How |
| --- | --- |
| Arc version | Arc menu → **About Arc** |
| Extension version | `package.json` / `arc://extensions` version column |
| Shortcut assignment | `arc://extensions/shortcuts` — note whether **Open … side panel** is blank or assigned |
| Toolbar icon | Does clicking the extension icon do anything? |
| Service worker errors | `arc://extensions` → extension → **Service worker** → **Inspect** → Console tab |
| Manual manager URL | Does `chrome-extension://YOUR_ID/sidepanel.html` open the UI in a tab? |

- **No store install yet** — unpacked load only until a Chrome Web Store (or other store) listing exists.
- **Side panel UX** may vary slightly by browser (width, pinning, shortcut handling).
- **Extension ID** differs per browser and per unpacked folder path; favicons and `chrome-extension://` URLs are not portable across machines or browsers.
- **Incognito** is disabled by manifest (`incognito: "not_allowed"`).
- **Not officially tested** on every fork; report issues if automation or the panel misbehaves on a specific browser.

Brave’s shields and ad blockers do not affect this extension — it makes **no network requests**.

---

## Development loop

```
npm run dev
```

This runs two parallel Vite watchers (`dev:panel` and `dev:sw`). After a file changes and Vite rebuilds, go to `chrome://extensions` and click the reload icon for the extension to pick up the new build.

There is no hot-module replacement. The MV3 Content Security Policy forbids remote scripts, so live-reload is not possible inside a Chrome extension.

---

## npm scripts

| Script | What it does |
|---|---|
| `npm run build` | Type-checks, bundles panel + service worker, writes manifest |
| `npm run dev` | Parallel Vite watch builds (panel + service worker) |
| `npm test` | Runs unit and property tests with Vitest |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm run lint` | ESLint + typecheck |
| `npm run verify` | Audits the built bundle (no eval, no remote URLs, size budget) |
| `npm run smoke` | Panel smoke test (CDP + Xvfb) |
| `npm run smoke:lifecycle` | Automated lifecycle sweep smoke test |
| `npm run smoke:recovery` | Close → recovery → restore smoke test |
| `npm run e2e` | Playwright E2E against the built extension (requires `npm run build`) |
| `npm run package` | Full build + verify + zip for distribution |

---

## Project layout

```
src/
  background/   Service worker: tab tracking, storage, lifecycle, messaging
  sidepanel/    React side-panel UI (App, views, components, hooks)
  onboarding/   React onboarding page (opened on first install)
  shared/       Pure utilities shared by all entry points
  tests/        Vitest unit, property, and orchestration tests
scripts/
  smoke-test.mjs           End-to-end panel smoke test
  lifecycle-smoke-test.mjs Lifecycle automation smoke test
  recovery-smoke-test.mjs  Recovery restore smoke test
  audit-bundle.mjs         Bundle safety auditor
e2e/
  panel.spec.ts            Playwright: inventory + navigation
  tab-actions.spec.ts      Playwright: sleep, lock, close via UI
  recovery.spec.ts         Playwright: auto-close + restore cycle
docs/
  PRD.md                   Product requirements document
  IMPLEMENTATION_PLAN.md   Milestone-by-milestone plan
  M2_EVAL_HARNESS.md       M2 test methodology
  M3_EVAL_HARNESS.md       M3 test methodology
  M4_EVAL_HARNESS.md       M4 stabilization harness
  MANUAL_TEST_PLAN.md      Pre-release manual checklist
  API_VERIFICATION.md      Performance measurements
```

---

## Privacy

- No network requests of any kind. This is enforced three ways: a `connect-src 'none'` Content Security Policy in the manifest, a build-time bundle audit that fails on any network API (`npm run verify`), and smoke-test assertions that the running panel issues zero `http(s)` requests.
- Site icons come from Chrome's local favicon cache, never from a remote `favIconUrl`, so opening the panel does not tell any website that you have its page open.
- No content scripts, no host permissions.
- No telemetry or analytics.
- All data is stored locally in `chrome.storage.session` and `chrome.storage.local`.
- Incognito windows are not managed and not tracked.

---

## Planning documents

- [`docs/PRD.md`](docs/PRD.md) — source Product Requirements Document (v0.1 scope).
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — milestone-by-milestone plan.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — product decisions; takes precedence over the plan where they disagree.
- [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) — headline limitations for v0.1.
- [`CHANGELOG.md`](CHANGELOG.md) — release notes.
