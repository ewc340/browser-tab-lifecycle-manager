# browser-tab-lifecycle-manager

A Chrome (Manifest V3) extension that automatically manages tab clutter and memory use via sleeping (discarding) and grace-period closure, with per-tab protection, a recoverable closure history, and a transparent activity feed. Local-first: no accounts, no backend, no network calls, no telemetry.

**Status: Milestone 0 complete.** The skeleton is built: side panel with full tab inventory, onboarding page, service-worker scaffolding, and complete test/build/smoke infrastructure. Automatic tab sleeping and closing are not yet active (arrive in Milestone 2).

---

## Install for local use

1. `npm install`
2. `npm run build`
3. Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `dist/` folder.

**`dist/` is build output** (gitignored). You must run `npm run build` first. The last step prints `manifest.json written (…)`. If that line is missing, `dist/manifest.json` was not created — see [Troubleshooting](#troubleshooting) below.

Chrome 121 or later is required.

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
| `npm test` | Runs unit tests with Vitest |
| `npm run typecheck` | `tsc --noEmit` only |
| `npm run lint` | ESLint + typecheck |
| `npm run verify` | Audits the built bundle (no eval, no remote URLs, size budget) |
| `npm run smoke` | Launches real Chrome under Xvfb via CDP, loads the extension, and asserts the side panel renders, tab records are stored, zero network requests are made, and light+dark screenshots are captured to `artifacts/` |
| `npm run package` | Full build + verify + zip for distribution |

---

## Project layout

```
src/
  background/   Service worker: tab tracking, storage, messaging
  sidepanel/    React side-panel UI (App, views, components, hooks)
  onboarding/   React onboarding page (opened on first install)
  shared/       Pure utilities shared by all entry points
  tests/        Vitest unit tests for shared utilities
scripts/
  smoke-test.mjs   End-to-end smoke test (real Chrome, CDP)
  audit-bundle.mjs Bundle safety auditor (no eval, no remote URLs)
  build-manifest.mjs  Generates dist/manifest.json from manifest.config.ts
docs/
  PRD.md                  Product requirements document
  QUESTIONS_AND_GAPS.md   Pre-implementation review and decisions
  IMPLEMENTATION_PLAN.md  Milestone-by-milestone implementation plan
```

---

## Privacy

- No network requests of any kind. This is enforced three ways: a `connect-src 'none'` Content Security Policy in the manifest, a build-time bundle audit that fails on any network API (`npm run verify`), and a smoke-test assertion that the running panel issues zero `http(s)` requests.
- Site icons come from Chrome's local favicon cache, never from a remote `favIconUrl`, so opening the panel does not tell any website that you have its page open.
- No content scripts, no host permissions.
- No telemetry or analytics.
- All data (tab records, settings, activity log) is stored locally in `chrome.storage.session` and `chrome.storage.local`.
- Incognito windows are not managed and not tracked.

---

## Troubleshooting

### "Manifest file is missing or unreadable" in Chrome

1. Confirm you selected the **`dist/`** folder, not the repo root.
2. Run a full build and check the last line of output:

   ```bash
   npm run build
   ```

   You should see: `manifest.json written (Browser Tab Lifecycle Manager v0.1.0)`

3. If that line is **missing**, the manifest step failed. Run it alone to see the error:

   ```bash
   npm run build:manifest
   ```

4. Common causes:
   - **`npm install` not run** — `tsx` (used to generate the manifest) is a dev dependency.
   - **Build stopped early** — a typecheck or Vite error prevents the manifest step from running; scroll up in the build log.
   - **Only ran `npm run dev`** — that rebuilds JS but does not write `manifest.json`. Run `npm run build` at least once.

5. Verify the file exists:

   ```bash
   ls -la dist/manifest.json
   ```

---

## Planning documents

- [`docs/PRD.md`](docs/PRD.md) — source Product Requirements Document (v0.1 scope).
- [`docs/QUESTIONS_AND_GAPS.md`](docs/QUESTIONS_AND_GAPS.md) — critical review of the PRD: internal contradictions, Chrome-API technical risks, missing product decisions, and recommended defaults.
- [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md) — concrete milestone-by-milestone plan, assuming the review's recommended defaults.
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — answers to the review's open questions. Takes precedence over the plan where they disagree.
