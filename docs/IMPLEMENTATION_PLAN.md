# Tab Lifecycle Manager — Implementation Plan (MVP → Chrome Web Store)

Companion to `QUESTIONS_AND_GAPS.md`. This plan is written to be executed by an autonomous coding agent.
It assumes every "Recommended default" from that review (consolidated in its Section I) unless the
developer says otherwise. Every deviation from the PRD is called out explicitly in
[§9 Deviations](#9-deviations-from-the-prd) and inline with the marker **[DEVIATION]** or **[ADDITION]**.

Source of truth for product behavior remains `Smart_Tab_Lifecycle_Management_9adc.md` (the PRD),
specifically §§9–24 for mechanism and §§5, 10–12 for policy.

---

## 1. Goal and constraints

**Goal.** Ship a Chrome desktop extension that (a) gives the user a side-panel control center over all
their tabs, (b) unloads inactive tabs from memory, (c) closes long-abandoned unprotected tabs with a
30-day recoverable history and a per-action reason, and (d) is publishable on the Chrome Web Store for
use by the author and by strangers.

**Hard constraints (from the PRD, unchanged).**

- Manifest V3, Chrome desktop only. No backend, no account, no network calls of any kind at runtime.
- No content scripts, no host permissions, no page-content reading, no `eval`, no remote code.
- No analytics or telemetry. All data stays in the local browser profile.
- Lifecycle evaluation lives in a pure, unit-testable module; nothing important lives in service-worker
  globals.
- Safety exclusions (active / pinned / audible / locked / unmanageable) may never be silently weakened.
- Recovery data is written before a tab is removed. Tab state is re-fetched immediately before any
  destructive action.

**Stack (per PRD §23).** TypeScript (strict), React 18, Vite, CSS custom properties + plain CSS modules,
Vitest for unit tests, Playwright for the subset of E2E that is actually possible. Permitted extra
dependencies: `@tanstack/react-virtual` (list virtualization, ~3 KB), `fast-check` (property tests, dev
only), `zip` via `archiver` or the system `zip` binary (build only). Nothing else — no state library, no
UI framework, no date library (write `src/shared/time.ts`).

**Definition of "done" for this plan.** PRD §34's 22 bullets, plus: a reviewed CWS listing, a published
privacy policy, a reproducible `dist.zip`, and a documented support/feedback loop.

---

## 2. Assumed decisions

> **Superseded in part.** The developer has since answered the open questions; see
> [`DECISIONS.md`](DECISIONS.md), which takes precedence over this table. The material changes are:
> `sleepAfterMinutes` default is **60** (not 120); locking still permits sleeping but is customizable via
> a per-tab `keepLoaded` toggle plus a global `lockImpliesKeepLoaded` setting; distribution targets
> **private/small-group** first, so Milestone 5's store-listing and legal work is deferred; and the
> product name is **Browser Tab Lifecycle Manager**, kept changeable in one place.

These are the answers this plan implements. If the developer disagrees with any row, only the cited
milestone tasks change.

| Decision | Assumed value | Where implemented |
| --- | --- | --- |
| Automation on install | Off until onboarding completed; evaluator hard-gates on it | M2 |
| First 7 days of closing | Report-only ("would close") | M2 |
| `minimum_chrome_version` | `121` | M0 |
| Permissions | `tabs`, `storage`, `alarms`, `sidePanel`, `contextMenus`, `favicon`; `incognito: not_allowed` | M0 |
| Volatile state | `chrome.storage.session`; durable in `storage.local`, chunked + byte-budgeted | M0/M2 |
| Cross-restart activity | URL-keyed `activityLedger` (LRU 2000) | M2 |
| Browser downtime | Not counted as inactivity; 30-min settling period | M2 |
| Blast radius | ≤10 closes/sweep, ≤25/hour, ≤50 discards/sweep, chunks of 10 | M2 |
| Extra controls | "Keep loaded" (+ global `lockImpliesKeepLoaded`), "Snooze", per-host skip lists | M1/M2 |
| `sleepAfterMinutes` default | **60** (customizable) | M0 |
| Theme | Light + dark | M1 |
| Panel opening | `setPanelBehavior({ openPanelOnActionClick: true })`; onboarding in a tab | M0/M2 |
| Distribution | **Private / small group first**; public listing deferred | M5/M6 |
| Trader status | Non-trader | M5 |
| License | MIT, public GitHub repo, Issues for support | M5 |

---

## 3. Architecture

### 3.1 Component map

```text
┌──────────────────────────── Chrome ─────────────────────────────┐
│                                                                 │
│  Toolbar action ──(setPanelBehavior)──► Side panel (per window)  │
│                                              │  React 18        │
│                                              │  read-only view  │
│                                              ▼                  │
│  Context menu ─┐                     runtime.sendMessage        │
│  Commands ─────┤                             │                  │
│  Alarms ───────┼──────► Service worker ◄─────┘                  │
│  tabs/windows ─┘        (all mutations, single writer)          │
│                              │                                  │
│              ┌───────────────┼───────────────┐                  │
│              ▼               ▼               ▼                  │
│      storage.session   storage.local    chrome.tabs.*           │
│      (volatile)        (durable)        (discard/remove/create)  │
│                                                                 │
│  Onboarding page (normal tab, chrome-extension://…/onboarding)   │
└─────────────────────────────────────────────────────────────────┘
                    ▲
                    │ imports (no chrome.* calls)
        src/shared/ (pure logic: evaluator, eligibility, URL, time, strings)
```

**Invariant: the service worker is the only writer.** The side panel never calls `chrome.tabs.*` mutators
and never writes storage. It renders state it fetched via `GET_APP_STATE` and re-renders on broadcasts.
This makes concurrency reasoning tractable with N panels open (PRD §23 already implies it; make it
absolute).

### 3.2 Service-worker responsibilities

`src/background/index.ts` registers every listener **synchronously at top level** (PRD §17), then does no
other top-level async work. Each listener delegates to a module and enqueues onto a serialized task queue.

| Module | Responsibility |
| --- | --- |
| `index.ts` | Top-level listener registration only; ~80 lines, no logic |
| `listeners.ts` | Thin adapters: Chrome event → typed command → `taskQueue.push()` |
| `task-queue.ts` | **[ADDITION]** Serialized async queue; guarantees no interleaved read-modify-write |
| `tab-repository.ts` | CRUD over `storage.session` tab records; full-query reconcile; tombstones |
| `activity-ledger.ts` | **[ADDITION]** Durable URL-keyed `{lastActivatedAt, neverActivated, snoozedUntil, firstObservedAt}` with LRU eviction |
| `lock-service.ts` | Lock CRUD + startup rebinding (PRD §13) + navigation refresh |
| `lifecycle-engine.ts` | Re-exports the pure evaluator; converts `EvaluationResult[]` → executable plans |
| `lifecycle-sweep.ts` | Lease, caps, chunking, re-fetch-before-destroy, aggregation, retention trigger |
| `recovery-service.ts` | Recovery record write/read/restore/expiry; count + byte caps |
| `activity-service.ts` | Chunked activity append, aggregation, retention, byte budget, quota recovery |
| `alarm-service.ts` | Ensure-alarm-exists; dev fast period; startup/settling bookkeeping |
| `reconciliation-service.ts` | PRD FR-011 startup reconcile; downtime detection; migration entry |
| `context-menu-service.ts` | `removeAll()` + create in `onInstalled`; click routing |
| `badge-service.ts` | **[ADDITION]** `action.setBadgeText`/`setIcon` for pending count + paused state |
| `settings-service.ts` | Load/normalize/clamp/persist settings; migrations; onboarding gate |
| `messaging.ts` | `onMessage` router → typed handlers, structured `ExtensionResponse`, broadcast helper |
| `diagnostics.ts` | **[ADDITION]** Redacted local ring buffer of errors; export payload builder |
| `storage.ts` | Quota-aware `get`/`set` wrappers, chunked-key helpers, `getBytesInUse` budget enforcement |

### 3.3 Side-panel responsibilities

- Fetch `GET_APP_STATE` on mount, on `visibilitychange`, on broadcast, and on a 60 s low-frequency timer.
- Own only *view* state: search text, filter, sort, selection, active tab of the nav, theme override.
- Recompute relative times locally on a 30 s interval (PRD PERF-005/006 satisfied: no SW wake, no
  `tabs.query` polling).
- Virtualize the tab list. Derive display state and skip reasons by calling the same pure
  `shared/eligibility.ts` functions the SW uses — never re-implement rules in the UI.
- Views per PRD §11.1: `Tabs | Activity | Recovery | Settings`. Toasts via a single `aria-live="polite"`
  region.
- Version-skew guard: compare `state.extensionVersion` with the version captured at boot; if different,
  show "Extension updated — reload" (H2 in the review).

### 3.4 Shared pure-logic module

`src/shared/` must not reference `chrome.*` at all (enforced by an ESLint `no-restricted-globals` rule),
so it is trivially testable in Node.

```ts
// src/shared/lifecycle.ts  — the single source of lifecycle truth
export type LifecycleAction =
  | "NONE" | "SLEEP" | "SCHEDULE_CLOSE" | "CANCEL_CLOSE" | "CLOSE";

export interface EvaluationResult {
  actions: LifecycleAction[];        // [DEVIATION] was a single `action` (PRD §16)
  reason: string;
  pendingCloseAt?: number;
  skipReason?: string;               // surfaced in the UI, never persisted (review E10)
}

export interface EvaluationContext {
  now: number;                       // injected clock — never call Date.now() in shared/
  browserStartedAt: number;
  lastSweepCompletedAt: number;
  closuresThisSweep: number;
  closuresThisHour: number;
  discardsThisSweep: number;
  reportOnlyClosing: boolean;
}

export function evaluateTab(
  tab: ManagedTabRecord,
  settings: ExtensionSettings,
  ctx: EvaluationContext
): EvaluationResult;
```

Evaluation order (PRD §16 order preserved, guards added). Each numbered check returns immediately:

1. `!settings.onboardingCompleted` → `CANCEL_CLOSE` if pending, else `NONE`. **[ADDITION]** (review A1)
2. `settings.automationPaused` → same. (PRD)
3. `!tab.manageable || tab.incognito || !isNormalWindow` → `cancelPendingOrNone`. (PRD)
4. `tab.active` → `cancelPendingOrNone`. (PRD)
5. `tab.pinned` / `tab.audible` → `cancelPendingOrNone`. (PRD)
6. `tab.snoozedUntil && now < tab.snoozedUntil` → `cancelPendingOrNone("Snoozed")`. **[ADDITION]**
7. `hostMatches(settings.neverCloseHosts)` → close-ineligible (may still sleep). **[ADDITION]**
8. `hostMatches(settings.neverSleepHosts) || tab.keepLoaded` → sleep-ineligible. **[ADDITION]**
9. Compute `inactiveMs = max(0, now - tab.lastActivatedAt - tab.inactivityCreditMs)`. **[ADDITION]**
10. Compute `effectiveCloseAfter = tab.neverActivated ? max(closeAfterMinutes, 14d) : closeAfterMinutes`.
    **[ADDITION]**
11. `now - tab.firstObservedAt < 24h` → close-ineligible. **[ADDITION]**
12. `now - browserStartedAt < 30min` → close-ineligible ("settling"). **[ADDITION]**
13. `tab.closeLocked` → cancel any pending close; then fall through to the sleep check only. (PRD)
14. Close path (PRD §16, unchanged in shape): schedule → wait for grace → `CLOSE`; cancel when conditions
    no longer hold. Caps (`closuresThisSweep >= 10`, `closuresThisHour >= 25`) turn `CLOSE` into `NONE`
    with `skipReason: "deferred (rate limit)"`. **[ADDITION]**
15. Sleep path (PRD §16, unchanged), gated by `discardsThisSweep < 50`. **[ADDITION]**
16. `reportOnlyClosing` converts `SCHEDULE_CLOSE`/`CLOSE` into `NONE` with a `WOULD_CLOSE` marker the
    sweep records. **[ADDITION]**

Also in `shared/`: `eligibility.ts` (manageability classification, host matching, derived display state
+ precedence per review A6), `url-normalizer.ts` (PRD §20), `time.ts` (formatting + duration constants),
`defaults.ts` (`DEFAULT_SETTINGS`, `SAFETY_INVARIANTS`, clamps), `types.ts`, `messages.ts`,
`strings.ts` **[ADDITION]** (all user-facing copy in one place), `errors.ts` (PRD §28 codes),
`sanitize.ts` **[ADDITION]** (bidi-stripping, title truncation, hostname extraction).

### 3.5 Storage layout

**[DEVIATION from PRD §15]**: volatile tab state moves to `chrome.storage.session` (tab IDs are
session-scoped, so persisting them to disk guarantees stale data, unnecessary disk I/O, and an
unnecessary on-disk URL footprint); activity is chunked; a durable URL-keyed ledger is added.

```ts
// chrome.storage.session  (in-memory, 10 MB, cleared on browser restart / update / reload)
"tabRecords"          : Record<number, ManagedTabRecord>
"closingTabIds"       : number[]          // extension-initiated removals in flight
"sweepLease"          : { id: string; startedAt: number } | null
"sweepCounters"       : { hourBucket: number; closures: number }
"migrationLock"       : boolean

// chrome.storage.local (durable, 10 MB hard quota — no unlimitedStorage per PRD §21)
"settings:v1"         : ExtensionSettings                    // keep < 8 KB, URL-free (sync-ready)
"lockRecords:v1"      : TabLockRecord[]
"activityLedger:v1"   : Record<string /*normalizedUrl*/, LedgerEntry>   // LRU cap 2000
"activityIndex:v1"    : { buckets: string[]; newestBucket: string; count: number }
"activityEvents:v1:<bucket>" : ActivityEvent[]               // ≤100 events per bucket
"recoveryRecords:v1"  : RecoveryRecord[]                     // count cap 500 + byte budget
"runtimeState:v1"     : { browserStartedAt, lastSweepCompletedAt, lastRetentionRunAt,
                          reportOnlyUntil, whatsNewVersion, lastKnownVersion }
"diagnostics:v1"      : DiagnosticEntry[]                    // ring buffer 200, hostnames only
"migrationVersion"    : number
"backup:preMigration:<n>" : { settings, lockRecords }        // deleted after 2 clean startups
```

Byte budget enforcement, implemented once in `background/storage.ts`:

```ts
const BUDGET = { activity: 3_000_000, recovery: 2_000_000, total: 7_000_000 }; // of 10 MB

export async function setLocal(patch: Record<string, unknown>): Promise<void> {
  try {
    await chrome.storage.local.set(patch);
  } catch (e) {
    if (isQuotaError(e)) {
      await trimHistory({ aggressive: true });   // oldest activity buckets, then oldest recovery
      await chrome.storage.local.set(patch);     // one retry
      return;
    }
    throw toExtensionError(e, "STORAGE_WRITE_FAILED");
  }
}
```

Every `TabSnapshot` written to activity or recovery is capped: title truncated to 300 chars and
bidi-stripped, `favIconUrl` **omitted entirely** (favicons come from `_favicon/` at render time), and
aggregate events carry at most **20** snapshots plus `metadata.totalCount` **[DEVIATION from PRD §11.3/§14
implications]** (review C12: 1000 events × up to 500 snapshots would exceed the 10 MB quota by an order
of magnitude, and a full-quota condition would break the recovery write that must precede a closure).

### 3.6 Message contracts

PRD §19's `ExtensionRequest` union, plus **[ADDITION]s** (review G6). Bulk is the primitive; single-tab
callers pass a one-element array. Every message carries `v: 1`.

```ts
type ExtensionRequest =
  | { v: 1; type: "GET_APP_STATE" }
  | { v: 1; type: "GET_ACTIVITY"; cursor?: string; limit?: number }        // ADDITION (paging)
  | { v: 1; type: "LOCK_TABS"; tabIds: number[] }
  | { v: 1; type: "UNLOCK_TABS"; tabIds: number[] }
  | { v: 1; type: "SLEEP_TABS"; tabIds: number[] }
  | { v: 1; type: "WAKE_TABS"; tabIds: number[] }                          // ADDITION (review A7)
  | { v: 1; type: "CLOSE_TABS"; tabIds: number[] }
  | { v: 1; type: "ACTIVATE_TAB"; tabId: number }
  | { v: 1; type: "SET_KEEP_LOADED"; tabIds: number[]; keepLoaded: boolean } // ADDITION (B12)
  | { v: 1; type: "SNOOZE_TABS"; tabIds: number[]; untilMs: number }        // ADDITION (B18)
  | { v: 1; type: "CANCEL_PENDING_CLOSE"; tabIds: number[] }                // ADDITION
  | { v: 1; type: "SET_HOST_RULE"; host: string;
      rule: "NEVER_CLOSE" | "NEVER_SLEEP" | "NONE" }                        // ADDITION (B17)
  | { v: 1; type: "UPDATE_SETTINGS"; patch: Partial<ExtensionSettings> }
  | { v: 1; type: "COMPLETE_ONBOARDING"; enableAutomation: boolean;
      reportOnlyDays: number }                                              // ADDITION (B25/E2)
  | { v: 1; type: "PAUSE_AUTOMATION" } | { v: 1; type: "RESUME_AUTOMATION" }
  | { v: 1; type: "RESTORE_RECOVERY"; recoveryIds: string[]; lock: boolean }
  | { v: 1; type: "DELETE_RECOVERY"; recoveryIds: string[] }
  | { v: 1; type: "CLEAR_ACTIVITY" } | { v: 1; type: "CLEAR_RECOVERY" }
  | { v: 1; type: "RUN_LIFECYCLE_SWEEP" }
  | { v: 1; type: "EXPORT_DATA"; includeRecovery: boolean }                 // ADDITION (B22)
  | { v: 1; type: "IMPORT_SETTINGS"; json: string }                        // ADDITION
  | { v: 1; type: "GET_DIAGNOSTICS"; redaction: "HOSTNAMES" | "FULL" }     // ADDITION (E4)
  | { v: 1; type: "OPEN_SHORTCUTS_PAGE" };                                 // ADDITION (C19)
```

Responses use PRD §19's `ExtensionResponse<T>` unchanged. Broadcasts add
`{ type: "SWEEP_COMPLETED"; summary }` and `{ type: "SETTINGS_CHANGED" }`; **all broadcast sends are
`.catch(() => {})`** because a window with no open panel produces "Receiving end does not exist"
(review C20).

Handler skeleton (async requires `return true`):

```ts
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  taskQueue.push(async () => {
    try { sendResponse({ ok: true, data: await route(msg as ExtensionRequest) }); }
    catch (e) { sendResponse({ ok: false, error: toExtensionError(e) }); }
  });
  return true;
});
```

### 3.7 Build pipeline

Two Rollup/Vite passes, because the MV3 service worker must be a single self-contained module and the
panel is a multi-entry HTML app.

```ts
// vite.config.ts (panel + onboarding)
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
        onboarding: resolve(__dirname, "src/onboarding/index.html"),
      },
      output: { entryFileNames: "[name].js", assetFileNames: "assets/[name][extname]" },
    },
    target: "chrome121",
    sourcemap: false,      // no off-disk sourceMappingURL in the shipped zip (review D8)
    minify: "esbuild",     // minify, never obfuscate — reviewers read the code
  },
});

// vite.config.sw.ts (service worker)
export default defineConfig({
  build: {
    outDir: "dist", emptyOutDir: false, target: "chrome121",
    lib: { entry: "src/background/index.ts", formats: ["es"], fileName: () => "background.js" },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
```

```jsonc
// package.json scripts
{
  "dev":        "run-p dev:panel dev:sw",           // vite build --watch on both configs
  "dev:panel":  "vite build --watch",
  "dev:sw":     "vite build --watch -c vite.config.sw.ts",
  "build":      "rimraf dist && tsc --noEmit && vite build && vite build -c vite.config.sw.ts && node scripts/build-manifest.mjs",
  "verify":     "node scripts/audit-bundle.mjs",     // no eval / remote URLs / sourcemaps (D8)
  "package":    "npm run build && npm run verify && node scripts/zip.mjs",
  "test":       "vitest run",
  "e2e":        "playwright test",
  "lint":       "eslint . && tsc --noEmit"
}
```

`scripts/build-manifest.mjs` emits `dist/manifest.json` from `manifest.config.ts`, injecting `version`
from `package.json`, and injecting the CWS public `key` **only** when `TLM_DEV_KEY` is set (so the
unpacked build shares the published extension ID, which keeps `_favicon/` URLs and docs stable). The
uploaded zip contains neither `key` nor `update_url` (review D10).

There is no Vite dev server: MV3's `extension_pages` CSP forbids remote script, so HMR is not available
without hacks. `--watch` + reload at `chrome://extensions` is the dev loop (review C23).

---

## 4. Repository layout

PRD §24's structure, with additions marked. Keep the PRD's names where they exist.

```text
tab-lifecycle-manager/
├── public/icons/{icon-16,icon-32,icon-48,icon-128}.png
├── manifest.config.ts                     # ADDITION: typed manifest source
├── scripts/{build-manifest,audit-bundle,zip,make-icons}.mjs   # ADDITION
├── src/
│   ├── background/         # per §3.2 (adds task-queue, activity-ledger, badge-service,
│   │                       #           diagnostics, storage, settings-service, messaging)
│   ├── sidepanel/          # per PRD §24 (adds views/OnboardingCard, components/{HostRules,
│   │                       #   SnoozeMenu,VirtualTabList,ThemeProvider,DiagnosticsPanel})
│   ├── onboarding/         # ADDITION: index.html + Onboarding.tsx (review B25)
│   ├── shared/             # per PRD §24 (adds lifecycle.ts, strings.ts, sanitize.ts, clamps.ts)
│   └── tests/              # per PRD §24 + sweep/orchestration/property/migration tests
├── e2e/                    # ADDITION: Playwright specs + fixtures
├── store/                  # ADDITION: LISTING.md, PRIVACY.md, screenshots/, promo/
├── docs/                   # ADDITION: MANUAL_TEST_PLAN.md, API_VERIFICATION.md, RELEASE.md,
│                           #           KNOWN_LIMITATIONS.md, PERMISSIONS_CHANGELOG.md
├── .github/workflows/ci.yml, ISSUE_TEMPLATE/    # ADDITION
├── CHANGELOG.md, LICENSE, PRIVACY.md, SUPPORT.md, README.md
└── package.json, tsconfig.json, vite.config.ts, vite.config.sw.ts, playwright.config.ts
```

---

## 5. Proposed manifest

```json
{
  "manifest_version": 3,
  "name": "Tab Lifecycle Manager",
  "version": "0.1.0",
  "description": "Sleep, protect, and automatically clean up inactive tabs — with a recoverable history.",

  "minimum_chrome_version": "121",
  "incognito": "not_allowed",

  "permissions": [
    "tabs",
    "storage",
    "alarms",
    "sidePanel",
    "contextMenus",
    "favicon"
  ],

  "background": { "service_worker": "background.js", "type": "module" },

  "action": {
    "default_title": "Open Tab Lifecycle Manager",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },

  "side_panel": { "default_path": "sidepanel.html" },

  "commands": {
    "_execute_action": {
      "suggested_key": { "default": "Alt+Shift+T", "mac": "Alt+Shift+T" },
      "description": "Open Tab Lifecycle Manager"
    },
    "toggle-tab-lock": {
      "description": "Keep the current tab (protect from automatic closing)"
    }
  },

  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  }
}
```

Manifest deltas vs PRD §22, all justified in §9: `minimum_chrome_version` 116 → **121**;
`+ "favicon"` permission; `+ "incognito": "not_allowed"`; `+ action.default_icon`;
`+ _execute_action` command; `toggle-tab-lock` ships **without** a suggested key.

Deliberately absent: `update_url` (only for self-hosted `.crx`; must not appear in a CWS upload) and
`key` (dev-only injection). `web_accessible_resources` is **not** needed — `_favicon/` only requires it
for content scripts, and there are none.

---

## 6. Phased build plan

Each milestone lists tasks, exit criteria, and technical notes. Milestones are strictly ordered (PRD §35
rule 1). No post-MVP feature work inside M0–M4 (PRD §35 rule 2).

---

### Milestone 0 — Project skeleton and contracts

**Maps to** PRD §31 Milestone 0 and backlog `P0-01`.

**Tasks**

1. `npm init`; add TypeScript strict, React 18, Vite, Vitest, ESLint (with
   `no-restricted-imports` banning `chrome` inside `src/shared/**` and banning bare `console.*` outside
   `src/shared/log.ts`), Prettier.
2. `manifest.config.ts` + `scripts/build-manifest.mjs` producing §5's manifest.
3. Placeholder icons (`scripts/make-icons.mjs` from one SVG master); real art in M5.
4. Both Vite configs (§3.7); confirm `dist/` contains `background.js`, `sidepanel.html`,
   `sidepanel.js`, `onboarding.html`, `manifest.json`, `icons/`.
5. `src/shared/types.ts` — every interface from PRD §14 **plus** the added fields
   (review G1/G3/G4): on `ManagedTabRecord`: `groupId`, `status`, `frozen`, `autoDiscardable`,
   `neverActivated`, `discardedBy`, `keepLoaded`, `snoozedUntil`, `inactivityCreditMs`,
   `pendingCloseScheduledAt`, `pendingCloseRuleMinutes`, `removedAt`; drop the per-record
   `schemaVersion` (versioning is per storage key). On `RecoveryRecord`: `groupId`, `pinned`,
   `restoredAt`, `activityEventId`. On `TabLockRecord`: nothing structural, keyed by `lockId`.
6. `src/shared/defaults.ts` — one complete `DEFAULT_SETTINGS: ExtensionSettings` including
   `schemaVersion: 1`, `onboardingCompleted: false`, `automationPaused: false`, `sleepEnabled: false`,
   `autoCloseEnabled: false`, `sleepAfterMinutes: 120`, `closeAfterMinutes: 10080`,
   `closeGraceMinutes: 10`, `maximumRecoveryRecords: 500`, `neverSleepHosts: [seeded]`,
   `neverCloseHosts: []`, `theme: "system"`. Plus `clampSettings()` with the ranges from review A5.
7. `src/shared/messages.ts` (§3.6), `errors.ts` (PRD §28 codes verbatim), `strings.ts`, `time.ts`,
   `sanitize.ts`.
8. `background/storage.ts` (quota-aware wrappers, chunked-key helpers), `tab-repository.ts` (session
   storage), `settings-service.ts` (load → normalize → clamp → persist), `task-queue.ts`,
   `messaging.ts` with a `GET_APP_STATE` handler that returns tabs from a live
   `chrome.tabs.query({ windowType: "normal" })` merged with (empty) records.
9. `background/index.ts` registering every PRD §17 listener at top level, all no-ops except
   `GET_APP_STATE`, plus `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` in both
   `onInstalled` and at module top level.
10. Minimal panel: React app, theme provider (light/dark via CSS custom properties), the four-tab nav
    shell, and a plain (non-virtualized) tab list grouped by window showing title, hostname,
    `active/pinned/audible/discarded` flags, and favicons via `_favicon/`.
11. `README.md` with load-unpacked instructions.
12. Run verification tasks **J3, J8, J13, J14, J15** from the review; record results in
    `docs/API_VERIFICATION.md`.

**Exit criteria**

- `npm run build` clean; `chrome://extensions` loads `dist/` with **zero** errors and warnings.
- Repeated reload of the unpacked extension never errors (PRD's own M0 gate).
- Clicking the toolbar icon toggles the side panel; a second click closes it (or the deviation is
  recorded if J8 shows otherwise).
- Panel lists all tabs from all normal windows, grouped by window, with favicons rendering with the
  network tab of the panel's DevTools showing **zero** outbound requests.
- `npm run lint` passes, including the `chrome`-free `shared/` rule.

**Notes for the implementing agent**

- Never `await` before `sidePanel.setPanelBehavior` on a gesture path; it is fine at startup.
- `chrome.storage.session.setAccessLevel` is unnecessary (no content scripts).
- Confirm `_favicon/` works from the panel without `web_accessible_resources`; if the extension ID
  changes between loads, use `chrome.runtime.getURL` (never a hardcoded ID).

---

### Milestone 1 — Manual control center

**Maps to** PRD §31 Milestone 1 and `P0-02` … `P0-06`. At the end of this milestone the extension is
useful with no automation at all — this is the correct thing to dogfood first.

**Tasks**

1. `shared/eligibility.ts`: `classifyManageability(tab)` returning
   `{ canDiscard, canClose, unavailableReason }` for the full prefix list in review B10 (`chrome://`,
   `chrome-extension://`, `chrome-untrusted://`, `chrome-search://`, `devtools://`, `view-source:`,
   `about:`, `data:`, `blob:`, `filesystem:`, `file://`), with the NTP/`about:blank` special case
   (`canClose: true`, no recovery) and `file://` (`canDiscard: true, canClose: false`).
   `deriveDisplayState(tab)` with the corrected precedence (review A6).
   `hostMatches(url, patterns)` supporting exact hosts and a leading `*.`.
2. `tab-repository.ts` full implementation: reconcile from a single `tabs.query`, upsert on events,
   tombstone on `onRemoved` (`removedAt`, purged next sweep — review C11), transfer records on
   `onReplaced`.
3. Live event wiring per PRD §17, **plus** `windows.onFocusChanged` → set `lastActivatedAt = now` for
   the newly focused window's active tab and ignore `WINDOW_ID_NONE` **[ADDITION]** (review B5), and
   `windows.onRemoved` → drop that window's records with no recovery records.
4. `lock-service.ts`: `lockId` generation, lock/unlock, `closeLocked` mirrored onto the tab record,
   URL/title refresh on `onUpdated` (lock follows the tab instance — review B6), and an origin-change
   `WARNING`.
5. Manual actions in the SW: sleep (`discard` with the **return-value check** from review C1: treat
   `undefined` or `discarded !== true` as `TAB_DISCARD_FAILED`, never write a success event), wake
   (`tabs.reload`, per J7), close (`tabs.remove` with `closingTabIds` bookkeeping), activate
   (`windows.update({focused:true})` then `tabs.update({active:true})`), keep-loaded
   (`tabs.update({autoDiscardable:false})` + flag), snooze, host rules.
6. Panel Tabs view per PRD §11.2: header counts, search (title/hostname/full URL, case-insensitive,
   local), window filter, state filter, sort selector (all six PRD options), bulk-selection toggle,
   row hover/focus lock affordance, overflow menu (PRD's items + Wake, Keep loaded, Snooze,
   "Never close this site"), bulk action bar with >5-close confirmation and >10-unlock confirmation.
7. Virtualized list (`@tanstack/react-virtual`) from the start — retrofitting is worse.
8. Settings view: automatic-sleep and automatic-close controls (inert until M2), duration selectors with
   the PRD's presets + Custom (validated by `clampSettings`), the four static safety guarantees, history
   retention rows, host rule editor, theme selector, "Set keyboard shortcuts →"
   (`chrome.tabs.create("chrome://extensions/shortcuts")`).
9. `context-menu-service.ts`: `removeAll()` then create in `onInstalled`, contexts `["page", "action"]`,
   static label, act on the `tab` argument only (review C14). `commands.onCommand` → same handler via
   `tabs.query({active:true,lastFocusedWindow:true})`; if the command is unbound
   (`chrome.commands.getAll()`), show a Settings hint.
10. Toast system with one `aria-live="polite"` region, Undo wired to the inverse action
    (sleep→wake, lock→unlock, keep-loaded→off, close→(M3) restore), never one toast per tab in a bulk
    action.
11. Accessibility pass on everything built so far (PRD §27): labels on all icon buttons, keyboard
    reachability, non-color lock indication, visible focus, 200% zoom, focus-trapping dialogs.

**Exit criteria**

- Every PRD §11.2 element exists and works against real tabs; creating/closing a tab updates the list
  with no manual refresh.
- Lock/unlock works from row, overflow menu, page context menu, and keyboard command; reloading the
  extension does not duplicate context-menu items.
- Manual sleep visibly discards a tab (Chrome dims it); an already-discarded or active tab produces a
  clean, human-readable error and **no** success event.
- Search + filter over a generated 500-tab profile responds < 100 ms (PRD PERF-002); 1500 tabs render
  without freezing (review E1).
- Settings persist across browser restart; corrupted settings fall back to defaults with a warning.
- Keyboard-only and screen-reader spot check pass.

---

### Milestone 2 — Automated lifecycle (with the safety rails)

**Maps to** PRD §31 Milestone 2 and `P0-07` … `P0-11`, `P0-16`. This is the milestone where the
review's additions matter most; implement the rails **in the same commit series** as the automation, not
afterwards.

**Tasks**

1. `shared/lifecycle.ts` — the evaluator exactly as specified in §3.4, with the injected clock and
   context. Write the tests (M4's list) **as you go** (PRD §35 rule 13).
2. `activity-ledger.ts` — durable URL-keyed activity, LRU-capped at 2000, updated on every
   activation/creation and read during reconciliation (review B9). Include `snoozedUntil` so snoozes
   survive restarts.
3. `alarm-service.ts` — `chrome.alarms.create("lifecycle-sweep", { periodInMinutes: 5 })`;
   ensure-exists on every SW start, `onStartup`, `onInstalled`, and every manual sweep; a dev flag for
   `0.5`.
4. `reconciliation-service.ts` implementing PRD FR-011's eight steps, extended:
   - `onStartup` → set `browserStartedAt = now`.
   - Downtime detection: if `now - lastSweepCompletedAt > 12h`, add the gap to every tab's
     `inactivityCreditMs` so browser-closed time is not counted as inactivity **[ADDITION]** (review B2).
   - Seed `lastActivatedAt` from `max(ledger, tab.lastAccessed ?? 0, firstObservedAt)`.
   - Lock rebinding exactly per PRD §13 (including "do not guess" + warning + panel notice).
   - Cancel invalid pending closures; then one sweep.
   - Idempotent: running it twice changes nothing (assert in tests).
5. `onInstalled` handling **[ADDITION]** (review B1): on `reason === "update"`, cancel **all** pending
   closures, write one activity event naming both versions, run migrations, recreate the alarm, reset
   `browserStartedAt` (settling period applies), and set `whatsNewVersion`.
6. `lifecycle-sweep.ts`:
   - Acquire the SW-global mutex **and** the `storage.session` lease with 60 s stale takeover.
   - `tabs.query({ windowType: "normal" })` → reconcile → evaluate all → build an action plan.
   - Execute in chunks of 10 with a 50 ms yield; caps per review C17/B2.
   - **Re-fetch each tab immediately before any destructive action** and re-check active/pinned/audible/
     locked/snoozed/host-rule state (PRD §29, §35 rule 9). Abort that tab if anything changed.
   - Closure order (review G5): write recovery → add to `closingTabIds` → `tabs.remove` → append
     activity (with `activityEventId` back-reference) → remove from `closingTabIds`.
   - Per-tab `try/catch`; one failure never aborts the sweep (PRD §16).
   - Aggregate all sleeps into one event and all closures into one event per sweep (PRD §11.3).
   - On any storage write failure: abort, set `automationPaused = true`, banner (review H8).
   - Write `lastSweepCompletedAt`, update `sweepCounters`, trigger retention (≤1/hour), update the badge.
7. **Report-only mode** **[ADDITION]** (review E2): `runtimeState.reportOnlyUntil`; while active, closure
   actions are recorded as `WOULD_CLOSE` in a separate aggregate event and executed **not at all**.
   Sleeping runs normally. The panel shows a persistent card: "Report-only: cleanup would have closed N
   tabs. [Review] [Enable automatic closing] [Extend 7 days]".
8. Onboarding page **[ADDITION]** (review B25): opened via `tabs.create` on
   `onInstalled(reason === "install")`, because `sidePanel.open()` requires a user gesture and therefore
   cannot be triggered at install time. Contains the PRD §10 copy verbatim, editable thresholds, the
   trust summary, the pin-the-icon and shortcut hints, the "Enable automatic management" button, and the
   report-only choice (default: on, 7 days).
9. Global pause per PRD FR-012, plus the resume-blast-radius confirmation from review E11 and a
   grayscale toolbar icon while paused.
10. `badge-service.ts` **[ADDITION]** (review B19): pending-close count in amber; closures-in-last-24h in
    neutral until the Recovery view is opened; empty when idle; "paused" icon variant.
11. Any successful `UPDATE_SETTINGS` / pause / resume / onboarding-completion synchronously runs a sweep
    before responding, and a `closeGraceMinutes` change re-anchors pending closures with
    `max(existing, scheduledAt + newGrace)` (review A8).
12. Run verification tasks **J1, J2, J4, J5, J6, J7, J10** and record results; adjust the seeded
    `neverSleepHosts` list and the onboarding copy according to J1/J2 outcomes.

**Exit criteria**

- With `DEV_FAST_LIFECYCLE` (PRD §30.3: 1 / 2 / 1 minutes), a background tab sleeps, then enters
  `PENDING_CLOSE` with a visible countdown and reason, then closes; activating, locking, pinning, making
  audible, snoozing, pausing, or adding a host rule each cancel it, and each is visible in the feed.
- No tab is closed in the same evaluation in which it entered pending closure (PRD FR-006).
- Active, pinned, audible, locked, snoozed, keep-loaded, unavailable, host-ruled, never-activated-and-
  under-14-days, under-24h-old, and settling-period tabs are demonstrably never closed.
- Simulated 14-day downtime (manipulate `lastSweepCompletedAt` + system clock) produces **zero**
  closures at startup and correct `inactivityCreditMs`.
- Reloading the extension mid-grace-period clears pending closures and logs it.
- Two concurrent `RUN_LIFECYCLE_SWEEP` requests never double-close a tab.
- Report-only mode records `WOULD_CLOSE` and closes nothing.
- Killing the service worker (via `chrome://extensions` → "service worker" → terminate) mid-sweep leaves
  storage consistent, and the next sweep completes normally.

---

### Milestone 3 — Trust, recovery, and explanation

**Maps to** PRD §31 Milestone 3 and `P0-12` … `P0-15`.

**Tasks**

1. `activity-service.ts`: chunked append (≤100 events per bucket key), newest-first read with a cursor,
   aggregation, snapshot caps (20 + `totalCount`, no favicon URLs), retention by both age and count and
   **bytes**, and quota recovery.
2. `recovery-service.ts`: snapshot creation (before removal, always), restore into the original window
   when it still exists and the current normal window otherwise, original index best-effort,
   "Restore and lock", delete one, clear all, `restoredAt` bookkeeping, count + byte caps, expiry.
3. Activity view per PRD §11.3: newest first, all eight filters, aggregate rows expandable to child
   snapshots, inline actions ([View tabs] / [Restore] / [Lock restored tab] / [Unlock]), paging at 50.
4. Recovery view per PRD §11.4, plus the note "Just closed? Ctrl+Shift+T may restore it with its full
   history" **[ADDITION]** (review E13), plus a "Do not store closed-tab URLs" setting (review D18).
5. Skip-reason surfacing **[ADDITION]** (review E10): compute on demand in the row detail/tooltip
   ("Protected", "Pinned", "Snoozed until…", "Never closes: mail.google.com", "Deferred (rate limit)");
   never persisted as `RULE_SKIPPED` events.
6. Full error handling per PRD §28: every Chrome error mapped to a stable code and a human message;
   `diagnostics.ts` ring buffer (200 entries, hostnames only, bidi-stripped) **[ADDITION]** (review E4);
   "Copy diagnostic report" and "Copy usage summary" (review E3) with a visible preview of the exact
   payload before copying; "Download activity as JSON".
7. Export/import settings as JSON **[ADDITION]** (review B22), recovery URLs excluded unless explicitly
   checked.
8. `AUTOMATIC_MAINTENANCE` retention summary event, at most one per day (review G10).
9. "What's new" banner on `whatsNewVersion` change, linking to the changelog (review E7).

**Exit criteria**

- Every automatic action in the feed has a human-readable reason naming the applicable rule and the
  observed inactivity duration.
- Automatic closure always produces a recovery record; restore works after the original window has been
  closed; "Restore and lock" produces a locked tab.
- Killing the SW between `tabs.remove` and the activity append leaves a recovery record that the next
  reconciliation back-fills with an activity event.
- Retention removes expired activity and recovery records; a deliberately over-quota condition trims and
  recovers rather than failing user actions.
- Diagnostics and usage-summary payloads contain **no** full URLs and no page titles beyond what the user
  explicitly opts into.
- Sustained personal dogfooding is possible: this is the PRD's own bar for end of M3.

---

### Milestone 4 — Stabilization

**Maps to** PRD §31 Milestone 4 and `P0-17`.

**Tasks**

1. **Unit tests**: PRD §30.1's 20 required cases verbatim, plus:
   21. Onboarding not completed ⇒ no automatic action.
   22. Never-activated tab is not closed before 14 days.
   23. Tab younger than 24 h is never closed.
   24. Settling period suppresses closures for 30 minutes after startup/update/resume.
   25. Downtime credit: a 14-day browser-closed gap yields zero closures.
   26. Per-sweep and per-hour closure caps are enforced and the remainder is deferred, not dropped.
   27. Report-only mode never closes.
   28. Host rules block closing/sleeping independently.
   29. Snooze blocks both, and expires.
   30. `keepLoaded` blocks sleeping but not closing.
   31. Grace re-anchoring never shortens a running grace period.
   32. Negative or jumped clock deltas cannot produce a closure.
   33. Settings clamping rejects out-of-range and inverted thresholds.
2. **Property tests** (`fast-check`) for the safety invariants in review F2.
3. **Orchestration tests** with an in-memory fake `chrome` (review F1): recovery-before-removal ordering,
   re-fetch cancellation, partial failure isolation, lease/no-double-sweep, quota trim-and-retry,
   tombstone/`onReplaced` transfer, reconciliation idempotency.
4. **Migration framework** (review G11): ordered idempotent migrations run inside `onInstalled` under a
   session lock, pre-migration backup of `settings:v1` + `lockRecords:v1`, fail-safe (pause automation +
   `ERROR` event + banner, never destroy data), and a test that runs the whole chain twice.
5. **Playwright E2E** (the achievable subset per review F6): launch a persistent context with the built
   extension, open `chrome-extension://<id>/sidepanel.html` as a normal tab, assert the list reflects
   real tab creation/closing, drive lock/sleep/close through the UI, and run one full fast-lifecycle
   automation cycle including a restore. Explicitly out of scope: the side-panel container, toolbar
   click, context menu, keyboard command.
6. **Edge cases**: implement and test every item in PRD §29, plus review C18 (clock jumps), C11
   (`onReplaced`), B16 (user-closed pending tab), B11 (last tab of a named group), B7 (duplicated tab).
7. **Accessibility pass**: full PRD §27 checklist, 320 px minimum panel width, `aria-live` summary rather
   than per-row announcements, focus stability in the virtualized list under live updates, one real
   screen-reader run.
8. **Performance pass**: a generated 1500-tab profile (review J12). Record `tabs.query` latency, first
   render, search latency, sweep duration, and `getBytesInUse` in `docs/API_VERIFICATION.md`. Meet PRD
   PERF-001/002/003 with margin at 500 tabs and degrade gracefully at 1500.
9. **Docs**: `README.md` (install unpacked, dev loop, architecture map), `KNOWN_LIMITATIONS.md` (review
   H12's five headline limitations plus the full list), `docs/MANUAL_TEST_PLAN.md` (PRD §30.2's 17 items
   plus the update-path rehearsal from review F8), `docs/API_VERIFICATION.md`, `CHANGELOG.md`.
10. **Production defaults verification**: assert in a test that the shipped `DEFAULT_SETTINGS` has
    automation off, `sleepAfterMinutes: 120`, `closeAfterMinutes: 10080`, and that `DEV_FAST_LIFECYCLE`
    is unreachable in a production build (behind `import.meta.env.DEV`).
11. **CI** (`.github/workflows/ci.yml`): `lint` → `test` → `build` → `verify` (bundle audit) →
    `package`, uploading `dist.zip` as an artifact on every push; plus a job asserting that
    `manifest.permissions` matches the committed baseline unless `docs/PERMISSIONS_CHANGELOG.md` changed
    in the same commit.

**Exit criteria**

- PRD §34's 22 Definition-of-Done bullets all true.
- All unit, property, orchestration, and E2E tests green in CI; coverage of `src/shared/lifecycle.ts` at
  100% branch.
- The manual test plan has been executed end to end on the current build and recorded.
- The update-path rehearsal (install `N`, create locks + pending closures, load `N+1`) passes.
- **This is version 0.1.0** — tag it, and dogfood it for at least two weeks with report-only closing
  before M5's release work is considered ready.

---

### Milestone 5 — Chrome Web Store readiness **[ADDITION — absent from the PRD]**

The PRD ends at "loads unpacked." Everything here is new work required by the actual goal. None of it
depends on M4 finishing, so the asset/legal work can proceed in parallel with M4 — but nothing is
submitted until M4's exit criteria are met.

**5.1 Account and legal**

1. Create a dedicated publishing Google account; enable 2-Step Verification; pay the one-time **$5**
   developer registration fee. Do this **first** — account/verification friction is the most common
   release-day blocker.
2. Set the publisher display name, support email, and (if desired) a verified official URL via Google
   Search Console.
3. Declare **trader status: non-trader** (review D2). Record the decision and its rationale in
   `store/LISTING.md`, including the note that declaring "trader" would require publishing a physical
   address on the listing, and that monetization later flips this.
4. Add `LICENSE` (MIT) and a third-party attribution note for bundled dependencies.
5. Create the CWS item as a **Draft** immediately to reserve the item ID and obtain the public key
   (review D10); wire `TLM_DEV_KEY` into the dev manifest build.

**5.2 Privacy policy and privacy practices**

1. Write `PRIVACY.md` and publish it at a stable public URL (GitHub Pages). Required content:
   - What is stored locally: tab titles, URLs, window/index metadata, settings, activity history,
     recovery records (closed-tab URLs), and a local diagnostics buffer.
   - Where: `chrome.storage.local` / `chrome.storage.session`, on the user's device only.
   - Retention: 30 days for activity and recovery by default, user-configurable and user-clearable;
     everything is deleted when the extension is uninstalled.
   - What is never accessed: page content, form data, cookies, passwords, screenshots, incognito tabs.
   - Network: **the extension makes no network requests of any kind**; there is no server, no account,
     no analytics, no third-party service, no remote code.
   - Diagnostics: local-only, hostname-redacted, and shared only if the user manually copies and pastes
     them.
   - Contact address and a "last updated" date.
2. Fill the dashboard Privacy practices tab using the drafted text in `store/LISTING.md`:
   single-purpose statement, the six per-permission justifications (review D4), "no remote code," data
   disclosures, and the three certifications.
3. Verify consistency three ways — dashboard declarations, `PRIVACY.md`, and actual behavior — because
   contradictions are grounds for removal. Note the **August 1, 2026** policy updates now in force: data
   collection must be strictly necessary to the disclosed single purpose, all collection must be
   prominently disclosed, and users must be **proactively notified** if data handling changes after
   install (this is what M6's "what's new / data practices" surface is for).
4. Add a Settings link to the hosted privacy policy and to `KNOWN_LIMITATIONS.md`.

**5.3 Listing assets**

1. Final icon set from one SVG master: 16/32/48/128 for the manifest, 128×128 for the store, plus the
   grayscale paused variant. Design constraint: legible at 16 px; no Chrome logo, Chrome colors, or
   Google branding (review E6/D6).
2. **440×280** small promo tile (mandatory).
3. **4–5 screenshots at 1280×800**, full bleed, square corners, real UI captured from a purpose-built
   demo profile with innocuous tabs (never your real browsing): (1) tab list with mixed states,
   (2) a pending-close row with its reason and countdown, (3) Activity feed with an aggregate sleep event
   and a closure with [Restore], (4) Recovery view, (5) Settings showing the safety guarantees and host
   rules. Note that promo images get their own review (up to ~a week) and are not reviewed while the item
   is a Draft or Trusted-tester-only.
4. Optional: 1400×560 marquee tile (required for marquee featuring eligibility) and a short YouTube demo.
5. Listing copy in `store/LISTING.md`: name (check availability first — review D6), 132-char short
   description, long description leading with the two things that differentiate this from Chrome's own
   Memory Saver (protection + recoverable automatic closing + visibility), an explicit
   "what this extension does NOT do" section (no page reading, no network, no accounts), the
   known-limitations summary, and the permission explanations in user language. No keyword spam,
   no unattributed testimonials.

**5.4 Packaging**

1. `scripts/zip.mjs` producing `dist.zip` containing only `manifest.json`, `background.js`,
   `sidepanel.html/.js`, `onboarding.html/.js`, `assets/`, and `icons/`. No source, no maps, no `key`,
   no `update_url`, no `node_modules`, no dotfiles.
2. `scripts/audit-bundle.mjs` must fail the build on: `eval(`, `new Function(`, any `http://`/`https://`
   URL in shipped JS/CSS/HTML (except in comments/strings that are known-safe and allowlisted), any
   `sourceMappingURL`, any `chrome-extension://<hardcoded-id>`, and any `console.` outside `log.ts`.
3. Load `dist.zip` (unzipped) as an unpacked extension and confirm zero CSP violations and zero console
   errors (review J15).
4. Verify the permission-warning surface with
   `chrome.management.getPermissionWarningsByManifest` for the final manifest (review J9), and record the
   exact warning strings users will see in `docs/PERMISSIONS_CHANGELOG.md`. Confirm `favicon` adds no
   warning on top of `tabs`.
5. `docs/RELEASE.md`: the full checklist below, plus the rollback procedure (review F7).

**5.5 Store-submission checklist** (keep in `docs/RELEASE.md`)

```text
[ ] Version bumped in package.json; manifest version matches; git tag created
[ ] CHANGELOG.md updated
[ ] npm run lint && npm run test && npm run e2e all green
[ ] npm run package produces dist.zip; audit-bundle passes
[ ] dist.zip loaded unpacked: no errors, no CSP violations, panel + automation smoke-tested
[ ] Manual test plan executed on this build (docs/MANUAL_TEST_PLAN.md)
[ ] Update-path rehearsal from previous published version passes
[ ] Permission list unchanged (or PERMISSIONS_CHANGELOG.md updated + re-consent impact accepted)
[ ] Privacy policy URL live and consistent with dashboard declarations and actual behavior
[ ] Single purpose + all permission justifications + remote-code answer filled in
[ ] Data-use disclosures + 3 certifications completed
[ ] Trader status declared
[ ] 128x128 store icon, 440x280 tile, >=1 (target 5) 1280x800 screenshots uploaded
[ ] Listing name / short description / long description proofread; no Google or Chrome branding
[ ] Support URL (GitHub Issues) and homepage URL set
[ ] Distribution visibility set for this stage (Private -> Unlisted -> Public)
[ ] Staged rollout percentage set (updates only)
[ ] Post-submission: watch review status, reviews, and issues for 72h
```

**Exit criteria for M5**

- `dist.zip` uploads and validates in the dashboard with no policy warnings that block submission.
- All listing fields and assets are complete; a dry-run submission as **Private / trusted testers**
  succeeds and installs cleanly on a second machine or a clean Chrome profile.
- The installed-from-store build behaves identically to the unpacked build (especially favicons and the
  extension ID).

---

### Milestone 6 — Public release and feedback loop **[ADDITION — absent from the PRD]**

**6.1 Staged rollout** (review F3)

| Stage | Visibility | Audience | Duration | Gate to advance |
| --- | --- | --- | --- | --- |
| 1 | unpacked, local | just you | ≥2 weeks | 7 days report-only, then 7 days of real closing with zero unintended closures |
| 2 | CWS **Private** (trusted testers) | 3–10 people you can talk to | ≥2 weeks | no data-loss reports; two rounds of feedback addressed |
| 3 | CWS **Unlisted** | shared by link in 1–2 relevant communities | ≥2 weeks | issue tracker stable; no recurring crash/error reports |
| 4 | CWS **Public** | everyone, staged 10% → 50% → 100% | days between steps | reviews and issues watched at each step |

Do not skip stage 2. Strangers have window/profile/PWA/tab-group configurations you do not, and stage 2
is the only stage where you can actually converse with the affected user.

**6.2 Versioning and update strategy** (review D9)

- `MAJOR.MINOR.PATCH`, monotonically increasing, matching a git tag; CI asserts
  `package.json` ≡ `manifest.version` ≡ tag.
- `CHANGELOG.md` in Keep-a-Changelog format; every user-visible change gets a line in user language.
- Every functional update ships as a staged rollout. Every update that touches the sweep, storage, or the
  manifest requires the manual test plan and the update-path rehearsal.
- Update-time behavior is already specified in M2 task 5: cancel pending closures, run migrations,
  re-assert the alarm and panel behavior, apply the settling period, and set `whatsNewVersion`.
- **No rollback exists on CWS.** The remedy for a bad release is a fast `PATCH` that restores previous
  behavior, plus halting the rollout. The real mitigations are the blast-radius caps, report-only mode,
  and `automationPaused`.
- Permission changes are release *events*: they disable the extension for existing users until each one
  re-accepts. Any such release needs an explicit note in the changelog, the listing description, and the
  what's-new banner.

**6.3 Opt-in diagnostics that do not violate local-first** (review E4/F5)

Design, restated as a hard specification:

- **Zero network.** No endpoint exists, in any build. The bundle audit (M5.4) enforces this mechanically.
- Local ring buffer: 200 entries of `{ ts, code, message, contextHostname?, extVersion, chromeVersion }`.
  URLs are reduced to hostnames (or SHA-256 prefixes at the "FULL" redaction level) **before** they are
  written, never at export time.
- `Copy diagnostic report` and `Copy usage summary` render the **exact payload in a scrollable preview**
  before the user copies it. The user is the transport.
- `Download activity as JSON` for the user's own inspection, with an explicit "this contains the URLs of
  your tabs" warning.
- The GitHub bug template asks for the diagnostic report and states plainly that it contains hostnames.
- `PRIVACY.md` documents all of the above.

This satisfies PRD PRV-002 ("no analytics, telemetry, or remote logging") literally and in spirit, while
still making third-party bug reports actionable.

**6.4 Support channel and feedback loop** (review D12/E3)

1. Public GitHub repo (MIT), Issues enabled, `SUPPORT.md`, issue templates for bug/feature/question that
   pre-ask for extension version, Chrome version, OS, tab count, and the diagnostic report.
2. Listing support URL → Issues; homepage URL → the Pages site.
3. In-panel Settings: "Report a problem" (opens a prefilled GitHub issue URL with version/OS/counts —
   never URLs), "Copy diagnostic report", "Copy usage summary", links to the privacy policy and known
   limitations.
4. Reply to every CWS review for the first months; reviews are the only public feedback surface and
   responsiveness measurably affects installs.
5. A pinned GitHub Discussion asking users to paste their usage summary, specifically the
   restore-rate metric (review H7): a high restore rate is the signal that the default close threshold is
   too aggressive, and it is the one product question you cannot answer from your own machine.
6. Surface the restore rate to each user in Settings as a self-tuning hint ("You restored 40% of
   automatically closed tabs — consider a longer close threshold"), which turns the §6.2 metrics into a
   user-facing feature rather than dead code.

**Exit criteria for M6**

- Published publicly at 100% rollout with a live listing, working support links, and a changelog.
- At least one full update (`0.1.0` → `0.1.1`) shipped through the staged pipeline, proving the update
  path, migrations, and rollout controls.
- At least three external users have completed a two-week usage period with no unrecoverable data loss
  reported.

---

## 7. Post-MVP alignment

No change to PRD §32's roadmap ordering (v0.2 duplicate reuse → v0.3 URL identity → v0.4 archive →
v0.5 broader locks → v0.6 collections → v0.7 smart retention → v0.8 notifications). Three notes:

1. Several v0.5 items are partially delivered early by this plan (`keepLoaded` ≈ "Keep awake"; host skip
   lists ≈ a minimal domain lock; snooze ≈ temporary lock). Update the roadmap so v0.5 becomes
   "URL-pattern locks, tab-group locks, and lock durations" rather than re-implementing what exists.
2. v0.7's reading-duration and copy-event signals require content scripts and host permissions. That is a
   new permission warning (forced re-consent, review D11), a new privacy-policy version, a new data
   disclosure, and — under the August 2026 Limited Use rule — a defensible argument that the data is
   *strictly necessary* to the disclosed single purpose. Treat it as a separate product decision, not an
   increment.
3. v0.8's OS notifications need the `notifications` permission, which also forces re-consent. If OS
   notifications are likely within a few releases, consider bundling that permission into a single
   deliberate "re-consent release" together with any other permission additions, rather than spending the
   re-consent cost twice.

---

## 8. Milestone dependency summary

```text
M0 skeleton ──► M1 manual control center ──► M2 automated lifecycle ──► M3 trust & recovery ──► M4 stabilization ──► v0.1.0 tag
                                                                                                    │
                          M5 store readiness (assets, legal, privacy, packaging) ───────────────────┴──► M6 staged public release
                          (asset/legal work may run in parallel with M2–M4; submission waits for M4)
```

---

## 9. Deviations from the PRD

Every deviation is documented here per PRD §35 rule 14. Nothing below weakens a safety exclusion; all of
the behavioral additions make the extension *less* likely to remove a tab.

| # | Deviation / addition | PRD reference | Why |
| --- | --- | --- | --- |
| 1 | `DEFAULT_SETTINGS` ships with automation **off** and includes `schemaVersion`/`onboardingCompleted`/`automationPaused`; evaluator hard-gates on `onboardingCompleted` | §10, §14 | Resolves a direct self-contradiction; prevents unconsented closures on first install (review A1/A2) |
| 2 | `skipPinnedTabs`/`skipAudibleTabs` become compile-time constants, not settings | §10, §14 | A literal-typed field inside a `Partial<>` patch can silently become weakenable (review A3) |
| 3 | `operateAcrossAllWindows` removed | §10, §14 | Defined nowhere and used nowhere; a setting that does nothing is a trust bug (review A4) |
| 4 | Settings ranges clamped and cross-validated (`closeAfter ≥ max(sleepAfter, 60)`) | §11.5 | "Custom" durations otherwise permit a close-everything-in-5-minutes configuration (review A5) |
| 5 | `EvaluationResult.actions` is an array | §16 | Lets one sweep both sleep and schedule a close, which §9.3 asks for but the single-action shape cannot express (review A9/A10) |
| 6 | Display precedence `UNAVAILABLE > ACTIVE > PENDING_CLOSE > IDLE > BACKGROUND`, and `pendingCloseAt` is ignored for display while `active` | §9.2 | Prevents showing "closing soon" on the tab the user is currently reading (review A6) |
| 7 | `minimum_chrome_version: 121` | §22 | `tabs.Tab.lastAccessed` — which FR-002 depends on — is Chrome 121+; 116 would silently break activity bootstrapping (review C3) |
| 8 | `favicon` permission added; favicons rendered from `_favicon/` | §21 | Rendering remote `favIconUrl`s makes third-party network requests, contradicting PRV-001; `favicon` adds no new install warning alongside `tabs` (review C13) |
| 9 | `"incognito": "not_allowed"` | §5.5, PRV-006 | Makes the incognito guarantee structural rather than a code convention (review B21) |
| 10 | Tab records in `chrome.storage.session`; durable URL-keyed `activityLedger` in `storage.local` | §15 | Tab IDs are session-scoped, so disk-persisted tab records are stale by construction and would reset the close clock at every browser restart — which would make auto-close effectively never fire (review B9/C21) |
| 11 | Activity chunked across keys; snapshots capped at 20/event; favicon URLs never stored; byte budget + trim-and-retry | §11.3, §14, §15 | 1000 events × up to 500 snapshots exceeds the 10 MB `storage.local` quota, and a full quota breaks the recovery write that must precede a closure (review C12) |
| 12 | Downtime is not counted as inactivity; 30-minute settling period after startup/update/resume | §29 | Otherwise returning from a two-week absence mass-closes tabs ten minutes after launch (review B2/E11) |
| 13 | Blast-radius caps: ≤10 closes/sweep, ≤25/hour, ≤50 discards/sweep, chunks of 10 with yields | §26 | Bounds the worst case of any policy or clock bug, and avoids CPU spikes at 500+ tabs (review C17) |
| 14 | Pending closures cancelled on extension update; settling period applied | (absent) | An update tears down the worker and clears alarms; executing old-code closures immediately after new code loads is the highest-risk moment in the product (review B1) |
| 15 | Never-activated tabs use `max(closeAfter, 14d)`; no tab closes within 24 h of first observation | §12 FR-002 | `lastAccessed` is populated at creation even for background tabs, so read-later tabs would otherwise be closed unread (review B8/C4) |
| 16 | Report-only ("would close") mode, default for the first 7 days | §30.3 | Fast-lifecycle testing validates mechanism, not policy; this makes the destructive feature auditable before it is destructive (review E2) |
| 17 | Per-host skip lists (`neverSleepHosts` seeded, `neverCloseHosts`) | §7 (domain locks deferred) | Pure string matching, no new permission; without it users re-lock the same sites forever, and mail/chat/meeting tabs get discarded (review B13/B17/C2) |
| 18 | `keepLoaded` per-tab flag + `autoDiscardable: false` | §3.3 (Keep awake deferred to v0.5) | ~20 lines; prevents the most predictable trust complaint ("I locked it and it still reloaded and lost my place") (review B12) |
| 19 | Snooze ("keep 7 more days") | (absent) | The only alternative to lock-forever when the panel says "closing in 10 minutes"; prevents lock-list rot (review B18) |
| 20 | `WAKE_TABS` message + row action | §11.2 shows `[Wake]` with no FR | Makes the promised "Undo where possible" for sleep actually implementable (review A7) |
| 21 | Action badge for pending closures and recent closures; grayscale icon while paused | §4.10 (OS notifications deferred) | With the panel closed, closures currently have **zero** user-visible signal, contradicting §3.1 (review B19) |
| 22 | Onboarding is a normal tab opened on install, not a panel view | §10, §11.1 | `sidePanel.open()` requires a user gesture, so the panel cannot be auto-opened at install time (review B25/C7) |
| 23 | `windows.onFocusChanged` updates the newly focused window's active tab | §17 lists the listener with no responsibilities | `tabs.onActivated` does not fire when switching windows, so a tab being read in another window would age and be closed (review B5) |
| 24 | NTP/`about:blank` closeable with no recovery record; expanded unmanageable prefix list; `file://` never auto-closed | §5.6 | The four-prefix list misses `about:`, `data:`, `blob:`, `chrome-untrusted://`, etc., and leaves empty new tabs permanently unmanaged (review B10/C15) |
| 25 | `groupId` tracked; never auto-close the last tab of a named group | (absent entirely) | Tab groups are unmentioned in the PRD; closing the last member silently destroys a user-created structure (review B11) |
| 26 | `discard()` result checked (`undefined` ⇒ failure); success events only on verified transitions | §12 FR-004 | `discard()` resolves with `undefined` instead of rejecting for non-discardable tabs, so the feed would otherwise report sleeps that never happened (review C1) |
| 27 | Record tombstones (`removedAt`) purged next sweep | §17 | Makes `onReplaced` metadata transfer and post-close activity back-fill reliable regardless of event ordering (review C11/G5) |
| 28 | Sweep lease in `storage.session` in addition to the SW-global mutex | §16 | A worker-global mutex does not survive service-worker termination mid-sweep (review C5) |
| 29 | `RULE_SKIPPED` not persisted; skip reasons computed on demand in the UI | §14, §11.3 | Avoids flooding the feed while still answering "why is this tab still here" (review E10/G7) |
| 30 | Extra record/settings fields (`pendingCloseScheduledAt`, `restoredAt`, `activityEventId`, `maximumRecoveryRecords`, `inactivityCreditMs`, …); per-record `schemaVersion` dropped | §14 | Required for grace re-anchoring, the restore-rate metric, crash-safe closure bookkeeping, recovery caps, and downtime credit (review G1–G5) |
| 31 | Message contract extended and bulk-first; `v: 1` protocol version | §19 | The UI spec requires operations the contract omits; a panel document can outlive an SW update (review G6/H2) |
| 32 | Light + dark theme | §11, §27 | A permanently visible side panel that ignores the system theme is an uninstall trigger for the target audience (review E8) |
| 33 | Local, opt-in, hostname-redacted diagnostics + usage summary, copy-to-clipboard only | PRV-002 | Makes third-party bug reports actionable with zero network and no telemetry (review E3/E4/F5) |
| 34 | Export/import settings; optional "do not store closed-tab URLs" | §11.5 | Multi-profile usability and a real local-privacy control over 30 days of stored URLs (review B22/D18) |
| 35 | `toggle-tab-lock` ships with no suggested key; `_execute_action` = `Alt+Shift+T`; shortcuts page link | §12 FR-003, §22 | `Ctrl+Shift+L` is commonly claimed and Chrome drops conflicting suggestions silently, so the acceptance criterion would fail invisibly (review C19) |
| 36 | Sanitization before storage (bidi-strip, 300-char titles); URLs never rendered as anchors | PRV-008 | Escaping alone does not prevent bidi domain spoofing in the tab list (review H1) |
| 37 | Milestones 5 and 6 exist at all | §31, §34 | The PRD's Definition of Done stops at "loads unpacked"; the actual goal is a public Chrome Web Store release |
| 38 | Two added dependencies: `@tanstack/react-virtual`, `fast-check` (dev) | §23 | 500–1500 tab lists need virtualization; safety invariants deserve property tests. Neither is a state library or a UI framework, so §23's prohibitions are respected |

---

## 10. Risk register

| # | Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- |
| R1 | **Mass unintended closure** after long downtime, a clock jump, a resume-from-pause, or an update mid-grace | Medium | Critical (data loss + trust destroyed + 1-star reviews with no recourse) | Settling period; downtime credit; per-sweep and per-hour caps; 24 h minimum tab age; pending closures cancelled on update; report-only default; recovery snapshots; clamped negative deltas; property tests on every exclusion |
| R2 | **Sleeping loses unsaved user work** or breaks background app notifications (WebSocket teardown) | High | High (users blame the extension for losing a draft) | seeded `neverSleepHosts`; `keepLoaded` + `autoDiscardable:false` (and the global `lockImpliesKeepLoaded` option); never discard `status === "loading"`; explicit onboarding copy; verification tasks J1/J2 gate the copy and the seed list. Note the default `sleepAfterMinutes` is **60** per `DECISIONS.md`, so these mitigations carry more weight than they would at 120 |
| R3 | **`storage.local` 10 MB quota exhausted**, causing the pre-close recovery write to fail | Medium | High (closures without recoverability) | Snapshot caps; no stored favicon URLs; chunked activity keys; byte budget with trim-and-retry; on write failure abort the sweep and pause automation; quota test J11 |
| R4 | **Chrome API behavior differs from assumption** (`discard` semantics, `lastAccessed` after restore, `reload` on a discarded tab, side-panel toggle, `beforeunload` on `remove`) | Medium | Medium–High (silent feature breakage, wrong activity feed) | The 15-item verification checklist in the review's Section J is executed in M0/M2 and recorded in `docs/API_VERIFICATION.md`; every discard/close result is verified rather than assumed; the sweep re-queries rather than trusting events |
| R5 | **Permission set frozen wrong at v1.0** — later adding `favicon`, `sessions`, or `notifications` disables the extension for every user until they re-accept | Medium | High (installed-base attrition, and many users never re-enable) | Decide the full set before v1.0; include `favicon` now; verify warning collapsing with `getPermissionWarningsByManifest` (J9); CI baseline diff on the permission list; `PERMISSIONS_CHANGELOG.md` |
| R6 | **CWS review rejection or removal** — privacy declarations inconsistent with behavior, missing assets, `tabs` permission scrutiny, or the August 2026 Limited Use / disclosure rules | Medium | High (blocks release, or removes a live listing) | Drafted single-purpose and per-permission justifications; hosted privacy policy consistent with declarations and behavior; complete asset set; zero network requests (independently verifiable in DevTools, which is now the strongest possible claim); bundle audit proving no remote code |
| R7 | **No rollback on CWS** — a bad update auto-propagates to all users | Low–Medium | High | Staged rollout 10/50/100 with observation windows; trusted-tester and unlisted stages first; update-path rehearsal in the release checklist; caps and `automationPaused` bound the worst case; fast forward-fix procedure in `docs/RELEASE.md` |
| R8 | **Service-worker lifecycle bugs** — sweep interrupted mid-flight, duplicate sweeps, lost alarms, panel/worker version skew | Medium | Medium (inconsistent state, duplicated actions, confusing UI) | Nothing important in SW globals; session-storage lease with stale takeover; ensure-alarm on every entry point; idempotent reconciliation; tombstones and `activityEventId` back-fill; orchestration tests that terminate the worker mid-sweep; panel version-skew banner |
| R9 | **Performance collapse at 1000+ tabs** — the exact users who install a tab manager | Medium | Medium (unusable panel, reviews about freezing) | Virtualized list from M1; small per-record payloads; chunked sweeps; single `tabs.query` per sweep; 1500-tab profile in the M4 performance pass with recorded numbers |
| R10 | **Solo-maintainer sustainability** — a public listing creates an ongoing support obligation | High | Medium (abandoned listing, unanswered reviews) | Open-source MIT repo so others can fork or contribute; issue templates that front-load diagnostics; `KNOWN_LIMITATIONS.md` to pre-empt repeat questions; an explicit statement in the listing about the support model and response expectations |
