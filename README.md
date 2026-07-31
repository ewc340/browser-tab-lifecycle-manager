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
