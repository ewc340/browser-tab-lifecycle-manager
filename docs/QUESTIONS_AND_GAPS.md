# Tab Lifecycle Manager — Questions, Gaps, and Risks

A critical review of `Smart_Tab_Lifecycle_Management_9adc.md` (PRD, 2385 lines), written for a solo
developer who intends to build this MVP **and publish it on the Chrome Web Store** for themselves and
other users.

## How to read this document

Every item is phrased as a direct question the developer should answer, followed by:

- **Why it matters** — the concrete failure mode if it stays unanswered.
- **Recommended default** — the assumption an implementer should adopt to stay unblocked. All of these
  defaults are carried into `IMPLEMENTATION_PLAN.md`, so answering nothing is a valid choice; you will
  get the defaults.

Severity tags:

| Tag | Meaning |
| --- | --- |
| **P0-BLOCKER** | Spec is self-contradictory or unsafe; must be resolved before writing the relevant code. |
| **P0-TRUST** | Can destroy user data or user trust (the PRD's own stated primary risk). |
| **P1** | Will cause rework, a bad release, or a store rejection if ignored. |
| **P2** | Polish, future-proofing, or nice-to-have clarity. |

Two structural observations before the list:

1. The PRD is unusually good at *mechanism* (state model, evaluator, event handling, error codes) and
   unusually thin at *policy under adversarial conditions* — clock jumps, long browser downtime,
   mass-action blast radius, and the transition from "my laptop" to "strangers' laptops."
2. The PRD's stated distribution model ("locally loaded unpacked extension") is **inconsistent with the
   actual goal** (public Chrome Web Store release). Roughly 20% of the work needed for the real goal is
   simply absent from the document — see Section D. This is the single largest gap.

---

## Section A — Internal contradictions that block implementation

These are places where two parts of the PRD cannot both be implemented as written. A coding agent will
either stall or silently pick one; you should pick.

### A1. `DEFAULT_SETTINGS` enables automation, but §10 says automation must be off until onboarding is confirmed. Which wins? **P0-BLOCKER**

§10 declares `sleepEnabled: true, autoCloseEnabled: true` in `DEFAULT_SETTINGS`, then four paragraphs
later says: "The user must click `Enable automatic management` before automatic sleeping and closing
begin. Until that confirmation: `sleepEnabled = false`, `autoCloseEnabled = false`."

- **Why it matters** — If the literal `DEFAULT_SETTINGS` object is implemented, a brand-new install
  starts closing tabs after 7 days with no consent. That is exactly the "user wonders why a tab
  disappeared" failure the PRD's §3.1 exists to prevent, and it is also the kind of behavior that draws
  1-star reviews and store complaints.
- **Recommended default** — Ship `DEFAULT_SETTINGS` with `onboardingCompleted: false`,
  `sleepEnabled: false`, `autoCloseEnabled: false`, `automationPaused: false`. Treat the §10 values as
  the *post-onboarding* values the "Enable automatic management" button writes. The evaluator must also
  hard-gate on `onboardingCompleted === false ⇒ no automatic action`, so a corrupted settings blob can
  never re-enable automation implicitly.

### A2. `DEFAULT_SETTINGS` is missing three fields that `ExtensionSettings` requires. Is the interface or the literal authoritative? **P0-BLOCKER**

`ExtensionSettings` (§14) requires `schemaVersion`, `onboardingCompleted`, and `automationPaused`.
`DEFAULT_SETTINGS` (§10) omits all three, and also omits `schemaVersion`.

- **Why it matters** — It won't type-check; more importantly the migration/defaults-merge code in FR-010
  ("Missing fields are filled during schema migration") needs one canonical object to merge against.
- **Recommended default** — The interface is authoritative. Define exactly one
  `DEFAULT_SETTINGS: ExtensionSettings` constant in `src/shared/defaults.ts`, include all fields, and
  implement `normalizeSettings(unknown): ExtensionSettings` that deep-merges over the default and
  range-clamps every numeric field (see A5).

### A3. `skipPinnedTabs: true` / `skipAudibleTabs: true` are typed as literal `true` but appear in a settings UI and in `Partial<ExtensionSettings>` patches. Are they settings or constants? **P1**

§11.5 says they are displayed as "enabled, non-editable MVP guarantees". §14 types them as the literal
`true`. §19's `UPDATE_SETTINGS` accepts `Partial<ExtensionSettings>`.

- **Why it matters** — A literal-typed field in a `Partial<>` patch is a footgun: a future patch that
  sets `skipPinnedTabs: false` will type-check as `boolean` after any refactor, silently weakening a
  safety exclusion (violating §35 rule 15).
- **Recommended default** — Remove them from `ExtensionSettings` entirely. Make them compile-time
  constants (`SAFETY_INVARIANTS`) in `src/shared/eligibility.ts`, render them in Settings as static
  informational rows, and validate in `UPDATE_SETTINGS` that the patch contains no unknown keys.

### A4. `operateAcrossAllWindows` exists in settings but is never referenced by the eligibility rules or the evaluator. What does `false` mean? **P0-BLOCKER**

§10 and §14 define it; §9.3, §12, and §16 never use it. FR-001 unconditionally says "all tabs in all
normal Chrome windows."

- **Why it matters** — A setting that does nothing is worse than no setting; if a user turns it off and
  tabs keep closing, that is a trust bug and a plausible store complaint.
- **Recommended default** — Cut it from v0.1. If you want it, define it as: `false` ⇒ automation only
  evaluates tabs in the **currently focused normal window**, and all tabs in other windows are reported
  as `Skipped (other window)` in the panel. That definition is implementable but adds a window-focus
  dependency for no MVP benefit — hence: cut, and note it in the README as a known non-feature.

### A5. Nothing constrains the numeric settings ranges. What are the legal min/max for `sleepAfterMinutes`, `closeAfterMinutes`, `closeGraceMinutes`? **P0-TRUST**

§11.5 offers dropdown presets plus "Custom", with no bounds anywhere in the document.

- **Why it matters** — `closeAfterMinutes: 0` plus `closeGraceMinutes: 0` is a "close every background
  tab within 5 minutes" configuration reachable through the UI. Also, nothing forbids
  `closeAfterMinutes < sleepAfterMinutes`, which makes the "sleep before closing" principle (§3.2)
  unreachable, and nothing forbids `closeAfterMinutes` below the sweep interval.
- **Recommended default** — Clamp and validate in the shared module, in both the UI and the message
  handler: `sleepAfterMinutes ∈ [5, 43200]`, `closeAfterMinutes ∈ [60, 525600]`,
  `closeGraceMinutes ∈ [1, 1440]`, and enforce `closeAfterMinutes ≥ max(sleepAfterMinutes, 60)`.
  Reject out-of-range patches with `INVALID_SETTINGS` instead of clamping silently, so the UI can
  explain.

### A6. §9.2 puts `PENDING_CLOSE` above `ACTIVE` in display precedence, but activating a tab is supposed to cancel pending closure. Can an active tab display `PENDING_CLOSE`? **P1**

- **Why it matters** — Either the precedence list is dead code, or there is a window (between activation
  and the record write) where the panel shows the active tab you are looking at as "closing in 9
  minutes." The second is alarming to users and will be reported as a bug.
- **Recommended default** — Change precedence to `UNAVAILABLE > ACTIVE > PENDING_CLOSE > IDLE >
  BACKGROUND`, and additionally make the derived-state function *ignore* `pendingCloseAt` when
  `tab.active === true`. Keep the stored `pendingCloseAt` intact until the canceling write lands; only
  the display is affected.

### A7. §11.2's tab row shows a `[Wake]` button, but there is no functional requirement, message type, or activity event for waking a tab. Is "wake" in scope, and what does it do? **P1**

`ExtensionRequest` (§19) has no `WAKE_TAB`. `TAB_WAKE_OBSERVED` (§14) is described as a passive
observation in §17.

- **Why it matters** — Waking a discarded tab *without switching to it* is a genuinely useful action
  (pre-load before you need it), and it is the natural "Undo" for a sleep toast — which §11.6 promises
  ("Undo where possible"). Without it, "Undo" for sleep is undefined.
- **Recommended default** — Add `WAKE_TAB { tabId }` implemented as `chrome.tabs.reload(tabId)` on a
  discarded tab (which loads it in the background without stealing focus — **verify**, see C9). Record
  it as a manual `TAB_WAKE_OBSERVED` with `source: "MANUAL"`. Undo semantics: sleep→wake, lock→unlock,
  close→restore-from-recovery, bulk→apply the inverse to the same id set.

### A8. §5.7 says "the user changes or disables the automatic-close rule" cancels closure, and FR-006 says changing the threshold reevaluates all pending closures — but the only reevaluation trigger described is the 5-minute alarm. Is a settings change supposed to trigger an immediate sweep? And does changing `closeGraceMinutes` re-anchor existing `pendingCloseAt` values? **P1**

- **Why it matters** — A user who panics ("wait, it's about to close 30 tabs") and changes the setting
  expects immediate effect, not "sometime in the next 5 minutes." And if grace is extended from 10 to
  60 minutes, a tab already 9 minutes into its grace period will close in 1 minute unless you re-anchor.
- **Recommended default** — Any successful `UPDATE_SETTINGS`, `PAUSE_AUTOMATION`, `RESUME_AUTOMATION`, or
  onboarding completion synchronously runs a sweep before responding. On a `closeGraceMinutes` change,
  recompute `pendingCloseAt = pendingCloseScheduledAt + newGraceMs` for every pending tab (which
  requires adding a `pendingCloseScheduledAt` field — see G3). Never shorten a grace period that is
  already running: take `max(existingPendingCloseAt, recomputed)` when the new grace is shorter.

### A9. §16's evaluator returns `CANCEL_CLOSE` for a locked tab and returns early, skipping the sleep branch. Is that intended? **P2**

- **Why it matters** — A locked tab with a stale `pendingCloseAt` that is also past the sleep threshold
  gets no sleep action for one sweep cycle (5 min). Harmless, but it is exactly the kind of thing a unit
  test will encode as "correct" forever.
- **Recommended default** — Allow the evaluator to return an action list rather than a single action
  (`{ actions: ["CANCEL_CLOSE", "SLEEP"] }`), or accept the 5-minute delay and add a test comment.
  Recommend the action list — it also cleanly expresses "sleep now, schedule close" for the §9.3 rule
  that says closure evaluation "should attempt to sleep it first if possible" (which the current
  single-action pseudocode cannot express at all — see A10).

### A10. §9.3 says automatic close evaluation "should attempt to sleep it first if possible," but the §16 pseudocode returns `SCHEDULE_CLOSE` and never sleeps that tab. Which behavior is required? **P1**

- **Why it matters** — A tab that crosses the 7-day close threshold while still loaded will sit loaded
  and consuming memory through its whole grace period, and the reason string in the activity feed will
  not mention that it was slept. Minor memory issue, real spec ambiguity.
- **Recommended default** — Return both actions (per A9): sleep and schedule closure in the same sweep,
  recorded as one aggregate activity event with `reason` covering both. Sleeping is non-destructive so
  ordering does not matter for safety.

---

## Section B — Scope and product-decision ambiguities

### B1. What happens to pending-close tabs when the extension is updated (version bump) or reloaded mid-grace-period? **P0-TRUST**

The PRD covers service-worker restart (FR-011) but never `chrome.runtime.onInstalled` with
`reason: "update"`.

- **Why it matters** — On a CWS auto-update, Chrome tears down the service worker, clears alarms
  ("alarms generally persist until an extension is updated" — Chrome docs), wipes
  `chrome.storage.session`, and restarts. If `pendingCloseAt` timestamps persist in `storage.local`
  across an update, the very first post-update sweep can execute a batch of closures that were scheduled
  under the *old* code's rules, with no grace period remaining. That is the worst possible moment for a
  mass-close bug, because you also just changed the code.
- **Recommended default** — On `onInstalled` with `reason === "update"`: (1) cancel **all** pending
  closures and write one `AUTOMATION_PAUSED`-class activity event `"Pending closures cleared by
  extension update <old> → <new>"`; (2) run migrations; (3) recreate the alarm; (4) apply a
  post-update **settling period** (see B2) before any closure may be scheduled again. Locks, activity,
  recovery, and settings must survive untouched. Same treatment for `reason === "install"` (nothing to
  cancel) and for a manual unpacked reload (which fires `onInstalled` with `reason: "update"` for
  unpacked extensions in some Chrome versions — **verify**; behave identically either way).

### B2. After Chrome has been closed for two weeks (or the extension was disabled), every restored tab is instantly past a 7-day threshold. Does the extension mass-close them 10 minutes after startup? **P0-TRUST**

The PRD's §29 edge case "Browser sleeps longer than the threshold" only says "run one evaluation after
wake. Do not create duplicate activity events."

- **Why it matters** — This is the most likely catastrophic-data-loss scenario in the entire product:
  come back from vacation, open Chrome, and 10 minutes later 60 tabs vanish. The recovery list saves the
  URLs but not the user's trust, and this is precisely the review that kills a store listing.
- **Recommended default** — Three layers:
  1. **Settling period**: persist `browserStartedAt` on `onStartup`/`onInstalled`; suppress
     `SCHEDULE_CLOSE` and `CLOSE` for the first **30 minutes** of a browser session (sleeping is fine).
  2. **Downtime re-anchoring**: persist `lastSweepCompletedAt`. If `now - lastSweepCompletedAt > 12h`,
     treat the gap as "browser was not running" and add the gap to each tab's `lastActivatedAt`
     (i.e. do not count wall-clock time while Chrome was closed toward inactivity). Store this as an
     explicit per-tab `inactivityCreditMs` so it is auditable and unit-testable.
  3. **Blast-radius cap**: never auto-close more than **10 tabs per sweep** and **25 per hour**;
     overflow is deferred to later sweeps and surfaced in the panel header as
     "12 tabs queued for cleanup."
  Layer 2 is a genuine product decision (does "inactive for 7 days" mean 7 days of wall clock or 7 days
  of browsing?). Recommend "browsing time," because that is what users mean, and because wall-clock
  semantics makes the feature fire hardest exactly when the user has been away and is least prepared.

### B3. What exactly is a "normal browser window"? Do popup windows, app windows, PWA windows, and DevTools-undocked windows count? **P1**

Used in §9.3, FR-001, §14 (`unavailableReason`) without definition.

- **Why it matters** — `chrome.windows.Window.type` can be `"normal" | "popup" | "panel" | "app" |
  "devtools"`. Installed PWAs and `window.open`-created popups are not `"normal"`. If they are excluded,
  a user who runs Gmail/Slack as an installed PWA will never see those windows in the control center and
  never get memory relief there. If they are included, the extension can close an OAuth popup mid-flow.
- **Recommended default** — Query with `chrome.tabs.query({ windowType: "normal" })` for *automation*.
  For *display*, also list `popup`/`app` window tabs in a collapsed "Other windows" group marked
  `UNAVAILABLE — not a normal window`, so the user can see them and act manually. Document this in the
  README. Never automate a non-normal window in v0.1.

### B4. Is the exempt-from-automation tab "the active tab in every window" or "the active tab in the focused window only"? **P0-TRUST**

§5.4 says "the active tab in each window"; §9.3 says "tab is not active"; §11.2's header example shows
"Active 3" (three windows).

- **Why it matters** — With the per-window reading (which matches `tab.active` semantics), a user with 8
  windows has 8 permanently exempt tabs that may be months stale. That is arguably fine for closing, but
  it also means those 8 tabs are never *slept*, i.e. up to 8 fully loaded pages that Memory Saver-style
  cleanup never touches. If instead you only exempt the focused window's active tab, then switching
  windows can cause the tab you were reading in the other window to be discarded, and coming back to it
  triggers a reload — which is disruptive but memory-correct.
- **Recommended default** — Keep the per-window exemption for **closing** (safe, matches `tab.active`).
  For **sleeping**, exempt only the active tab of the currently focused window, plus any tab activated
  within the last `sleepAfterMinutes`. Practically: use `lastActivatedAt` (which already handles this) and
  drop the blanket "not active" check for sleeping in unfocused windows — but only after verifying
  `chrome.tabs.discard` actually permits discarding a tab that is active in a non-focused window (the
  API docs say a tab is discarded "unless it is active"; **this likely means any active tab**, so this
  recommendation may be technically impossible — see C2). If it is impossible, keep the per-window
  exemption and document that N windows means N always-loaded tabs.

### B5. Two Chrome windows on two monitors both show "active" tabs. Does `windows.onFocusChanged` update activity for the newly focused window's active tab? **P1**

§17 lists `chrome.windows.onFocusChanged` as a required listener but the "Event responsibilities"
subsection defines responsibilities for **no** `chrome.windows.*` event.

- **Why it matters** — `chrome.tabs.onActivated` does **not** fire when you alt-tab between Chrome
  windows. Without an `onFocusChanged` handler, a tab you have been reading for two hours in window B
  keeps an ancient `lastActivatedAt` and can be scheduled for closure as soon as you switch away from it.
  This is a real "it closed the thing I was reading" bug.
- **Recommended default** — On `windows.onFocusChanged(windowId)`, if `windowId !== WINDOW_ID_NONE`,
  set `lastActivatedAt = now` for that window's active tab. On `WINDOW_ID_NONE` (Chrome lost OS focus),
  do nothing. Also define `windows.onCreated` (nothing, tabs events cover it) and `windows.onRemoved`
  (drop that window's tab records, do **not** create recovery records — matches §29).

### B6. When a locked tab navigates to a different URL, does the lock follow the tab instance or become orphaned? **P1**

`TabLockRecord` (§13) stores `currentTabId`, `url`, and `normalizedUrl`; the rebinding algorithm matches
on URL, but nothing says what happens on in-session navigation.

- **Why it matters** — Two opposite failure modes. (a) Lock follows the instance: you lock a research
  article, then reuse that tab to browse Reddit for an hour — now Reddit is permanently protected and
  your lock list is meaningless. (b) Lock is URL-bound and drops on navigation: you lock a doc, click an
  internal link, come back — protection silently gone, tab gets closed. (b) is the dangerous one.
- **Recommended default** — The lock binds to the **tab instance** (protection is about "this tab I care
  about"), and `tabs.onUpdated` **refreshes** `url`/`normalizedUrl`/`title` on the lock record so restart
  rebinding still works. Additionally: if the *origin* changes (not just the path), keep the lock but
  mark the row with a subtle "locked (URL changed)" hint and log a `WARNING` activity event, so the user
  can notice and unlock. Do not auto-unlock — silently removing protection is the worse failure.

### B7. Chrome's own "Duplicate tab" clones a locked tab. Should the duplicate inherit the lock? **P2**

- **Why it matters** — Duplication produces a `tabs.onCreated` with the same URL and (in Chrome) an
  `openerTabId`. If locks are URL-keyed, the rebinding logic may later bind the lock to the wrong
  instance.
- **Recommended default** — The duplicate is a new, unlocked tab. Locks are keyed by `lockId` bound to
  one `tabId` at a time, and rebinding only ever runs at startup/reconciliation, never on `onCreated`.
  Add a test: duplicating a locked tab yields exactly one locked tab.

### B8. Do new tabs start their inactivity clock immediately, and is a never-activated background tab treated as inactive from birth? **P0-TRUST**

FR-002 initializes from `tab.lastAccessed`, else `now` for active tabs, else `firstObservedAt`.

- **Why it matters** — The classic usage pattern is middle-click 20 links to read later. Those tabs are
  never "activated." Under the spec as written, they are inactive from creation, so they sleep in 1 hour
  and are eligible to close in 7 days *without ever having been looked at*. Worse: Chrome populates
  `lastAccessed` at creation time even for background tabs (confirmed in the Chrome/Firefox
  compatibility discussion), so `lastAccessed` cannot distinguish "opened in background and never seen"
  from "viewed once at creation." The W3C WebExtensions issue on `lastAccessed` calls out exactly this.
- **Recommended default** — Track `neverActivated: boolean` on the record (set false on the first
  `onActivated`). Never-activated tabs: (a) are eligible for sleeping normally (that is the point of
  read-later tabs); (b) use `max(closeAfterMinutes, 14 days)` for closure; (c) render a distinct
  "never opened" badge in the panel, which is also a genuinely nice feature ("here are the 40 tabs you
  never actually read"). Also add a **minimum age** guard: no tab may be scheduled for closure within
  24h of `firstObservedAt`, regardless of thresholds.

### B9. How is `lastActivatedAt` reconstructed after a browser restart with session restore? **P0-TRUST**

Tab IDs are session-scoped (§13 acknowledges this for locks) but `tabRecords:v1` is keyed by `tabId` and
stored in `storage.local` (§15).

- **Why it matters** — After every restart, all stored tab records are stale (dead tab IDs) and every
  restored tab is a "new" tab whose `lastActivatedAt` becomes restore time. **The 7-day close clock
  therefore resets on every browser restart**, so for anyone who restarts Chrome weekly, auto-close —
  the product's original core use case (§4.1) — may literally never fire. Conversely, if you *do* trust
  `tab.lastAccessed` after restore and Chrome reports the pre-restart value, tabs become close-eligible
  immediately at startup (see B2).
- **Recommended default** — Introduce a durable, URL-keyed activity ledger:
  `activityLedger:v1 : Record<normalizedUrl, { lastActivatedAt, neverActivated, firstObservedAt }>`,
  capped at ~2000 entries with LRU eviction, stored in `storage.local`. Volatile per-tab records
  (keyed by `tabId`) move to `chrome.storage.session`. On startup reconciliation, seed each restored
  tab's `lastActivatedAt` from the ledger when the normalized URL matches (taking the max of the
  ledger value and `tab.lastAccessed`), and apply the B2 settling period. Duplicate URLs share a ledger
  entry — acceptable for v0.1, and worth documenting as a known imprecision.

### B10. Is an `about:blank` / `chrome://newtab` tab manageable, and if not, do empty new tabs accumulate forever? **P1**

§5.6 lists four unmanageable prefixes; the new-tab page is `chrome://newtab/` (and search-provider NTPs
can be an `https://` URL, and a blank tab is `about:blank`).

- **Why it matters** — Under the current rules, empty NTPs are `UNAVAILABLE` forever. Users produce
  these constantly (Ctrl+T then getting distracted). They are the *safest possible* tabs to close and the
  spec forbids it, so the tab strip stays cluttered by exactly the junk the product exists to remove.
  Also `about:blank`, `chrome-untrusted://`, `blob:`, `data:`, `file://`, and `chrome-search://` are all
  unhandled by the four-prefix list.
- **Recommended default** — Split "manageable" into two flags:
  - `canDiscard` — false for all privileged/internal schemes.
  - `canClose` — **true** for `chrome://newtab`, `about:blank`, and `about:newtab` when the tab has no
    navigation history *and* an empty/default title; these close after `min(closeAfterMinutes, 24h)` with
    **no** recovery record (nothing to recover) and no grace period. False for every other privileged
    scheme.
  Full unmanageable prefix list to implement: `chrome://`, `chrome-extension://`, `chrome-untrusted://`,
  `chrome-search://`, `devtools://`, `view-source:`, `about:` (except the NTP/blank case), `data:`,
  `blob:`, `filesystem:`, `file://` (see C15), and any tab where `url` is undefined/empty.

### B11. Tab groups are never mentioned in the entire PRD. What happens to grouped tabs, collapsed groups, and saved groups? **P1**

- **Why it matters** — Tab groups are now central to how heavy tab users organize work, and Chrome has
  saved/synced groups. Collapsed groups are exactly where forgotten tabs live, so automation will hit
  them hardest. Closing the last tab of a group destroys the group (name and color). Restoring from
  Recovery puts the tab outside its group. Group locks are explicitly deferred (§7), but *awareness* of
  groups cannot be deferred without a schema migration later.
- **Recommended default** — v0.1: add `groupId: number` (and, if cheap, the group's title/color from
  `chrome.tabGroups.get`, which needs the `tabGroups` permission — **do not add the permission in
  v0.1**; use `tab.groupId` only, which comes free with `tabs`). Display group membership as a chip in
  the row and offer "select all tabs in this group" for bulk actions. Never auto-close the **last**
  remaining tab of a named group in v0.1 (cheap safety rule that prevents silent destruction of a
  user-created structure); record `RULE_SKIPPED` with reason "last tab in group <name>". Store `groupId`
  in `RecoveryRecord` for future restore fidelity even though v0.1 does not re-group.

### B12. Does locking prevent sleeping? Users will assume it does. **P0-TRUST**

§3.3/§5.1 are explicit: a locked tab may still be slept. `Keep awake` is deferred to v0.5.

- **Why it matters** — This is the most predictable support complaint in the product: "I locked my tab
  and the extension still reloaded it and I lost my place / my form / my scroll position." Discarding a
  tab unloads the page; on reactivation Chrome re-navigates. Users read "lock" as "leave this alone."
- **Recommended default** — Do not change the mechanics, change the vocabulary and add a cheap escape
  hatch: rename the control from "Lock" to **"Keep"** (label: *Keep — never auto-close*), and add a
  second per-tab toggle **"Keep loaded"** that (a) exempts the tab from automatic sleeping and (b) sets
  `chrome.tabs.update(tabId, { autoDiscardable: false })` so Chrome's own Memory Saver also leaves it
  alone. `autoDiscardable` is available (Chrome 54+) at zero permission cost, and this converts a
  deferred v0.5 feature into ~20 lines. This is the single highest-value deviation from the PRD in this
  review.

### B13. Sleeping a tab destroys unsaved page state. Is a 1-hour default acceptable given there is no unsaved-form detection? **P0-TRUST**

§5.8 lists what recovery does not restore; §21 accepts that no content scripts means no unsaved-form
detection.

- **Why it matters** — With `sleepAfterMinutes: 60`, a half-written forum post, a Jira ticket draft, a
  JSFiddle, or an in-progress web form in a background tab can be discarded and lost. Chrome's *own*
  Memory Saver deliberately avoids discarding tabs it believes hold user input; an extension calling
  `chrome.tabs.discard()` explicitly may bypass those heuristics (**must be verified — see C2**). A
  second class of breakage: discarding disconnects WebSockets, so background Gmail/Slack/Discord tabs
  stop showing notification badges — which users will perceive as the extension breaking their apps.
- **Recommended default** — (a) Raise the default `sleepAfterMinutes` to **120**. (b) Ship a small,
  editable, non-empty-by-default **"never sleep" host list** seeded with common real-time/compose apps
  (`mail.google.com`, `*.slack.com`, `discord.com`, `teams.microsoft.com`, `meet.google.com`,
  `*.zoom.us`, `web.whatsapp.com`, `localhost`). This is pure string matching on URLs the extension
  already has — no new permission. (c) Say plainly in onboarding: *"Sleeping unloads the page. Unsaved
  text in a form may be lost when it reloads."* (d) Never discard a tab whose `status === "loading"`.

### B14. What is the interaction between this extension's sleeping and Chrome's built-in Memory Saver? **P1**

Never mentioned in the PRD.

- **Why it matters** — Chrome discards tabs on its own. The extension will observe `discarded: true` for
  tabs it never touched and display them as `IDLE`, which is fine, but the activity feed will have no
  entry explaining it — violating §3.1's "a user should never wonder why." It also raises the store
  question "why not just use Memory Saver?", which matters for your listing copy: the differentiator is
  auto-close, locks, recovery, and visibility — not sleeping.
- **Recommended default** — Add `discardedBy: "EXTENSION" | "EXTERNAL" | undefined` to the tab record.
  When `onUpdated` reports `discarded: true` for a tab the extension did not just discard, set
  `EXTERNAL` and show the row as "idle (Chrome)". Do not write an activity event for external discards
  (avoids feed noise), but do explain the distinction in a tooltip and in the README/store description.

### B15. Locked tabs and Chrome's automatic discarding: should the extension set `autoDiscardable`? **P2**

- **Why it matters** — See B12. It is the only lever available without host permissions.
- **Recommended default** — Only set `autoDiscardable: false` for tabs the user explicitly marks
  "Keep loaded," and reset it to `true` when the flag is removed or the tab record is dropped. Never
  set it globally (that would fight the browser's memory management and undermine the product's own
  stated purpose).

### B16. What happens to a tab that is `PENDING_CLOSE` when the user manually closes it, or when its window closes? **P2**

§29 covers "window closes" (no recovery records) and "user manually closes a locked tab" (allow), but not
a user-closed pending tab.

- **Why it matters** — Double-recording a closure, or creating a recovery record for a user action, both
  produce a confusing feed.
- **Recommended default** — `tabs.onRemoved` for a tab not in the extension's `closingTabIds` set is a
  user closure: delete the record, write **no** activity event and **no** recovery record. Maintain
  `closingTabIds` in `chrome.storage.session` (not a SW global) so the distinction survives worker
  termination mid-close.

### B17. Is there a way to say "never manage this site" at all in v0.1? **P1**

Domain locks are explicitly deferred (§7, §4.3), but per-tab locks are the only protection mechanism.

- **Why it matters** — Per-tab locking does not survive the pattern it most needs to: you close and
  reopen your bank/monitoring/dashboard tab daily. Users will re-lock the same site dozens of times and
  conclude the product does not work. The implementation cost is a `string[]` of hosts and one
  `hostname` comparison — there is no technical reason to defer it, only a scope-discipline reason.
- **Recommended default** — Ship a minimal **site skip list** in v0.1 (deviation from the PRD, justified):
  `neverSleepHosts: string[]` and `neverCloseHosts: string[]`, editable in Settings, plus a row overflow
  action **"Never close this site"** and a page context-menu item. Explicitly *not* a "domain lock" in
  the §4.3 sense (no per-URL-pattern matching, no lock records, no UI for wildcards beyond a leading
  `*.`). This is the safety valve that makes automation acceptable to enable at all.

### B18. Is there a "snooze"/postpone action distinct from locking? **P1**

Not in the PRD. `[Restore] [Lock restored tab]` in §11.3 is the closest thing.

- **Why it matters** — When the panel says "closing in 10 minutes," the only offered escapes are
  "activate it" or "lock it forever." Most users want "not now — remind me in a week." Without it, users
  over-lock, the lock list becomes noise, and auto-close stops doing anything.
- **Recommended default** — Add `snoozedUntil?: number` to the tab record and a row action
  **"Keep for 7 more days"** (also 1 day / 30 days). The evaluator treats `now < snoozedUntil` as a hard
  skip with reason "Snoozed until <date>". Snoozes are stored in the URL-keyed ledger so they survive
  restarts. This is small, and it is the natural pressure-release valve for a product whose main risk is
  being too aggressive.

### B19. What does the toolbar action's badge show, and how does a user learn that tabs were closed while the panel was shut? **P0-TRUST**

§11.6 toasts only appear "when the side panel is open." OS notifications are deferred (§4.10).

- **Why it matters** — The realistic usage pattern is that the panel is closed 99% of the time.
  Therefore, in practice, **automatic closures happen with zero user-visible signal**, which directly
  contradicts §3.1. The user's first discovery is noticing a missing tab — the exact failure the product
  is designed to prevent.
- **Recommended default** — Use `chrome.action.setBadgeText` (no extra permission) to show the count of
  tabs currently in `PENDING_CLOSE`, with an amber background, plus a tooltip "3 tabs will close soon —
  click to review." After closures, show the count of closures in the last 24h in a neutral color until
  the user opens the Recovery view. Also decide **now** whether you will ever want the `notifications`
  permission (see D11) — adding it after publishing disables the extension for every user until they
  re-accept.

### B20. Does the extension need any behavior for tabs created by Chrome Sync's "Send to your devices," session restore, or reading-list/promo tabs? **P2**

- **Why it matters** — These arrive as tabs the user never opened; under B8 defaults they are
  never-activated tabs and get the longer threshold, which is correct. Worth an explicit test.
- **Recommended default** — No special casing beyond B8. Add one manual test case.

### B21. Incognito is out of scope — but what does the extension do if it is enabled in incognito by the user? **P2**

§5.5/PRV-006 say it does not operate in incognito. `ManagedTabRecord.incognito` exists and §16 skips
incognito tabs.

- **Why it matters** — By default extensions are not allowed in incognito, so `chrome.tabs.query`
  will not return incognito tabs at all; the `incognito` guard is defense in depth. But if a user toggles
  "Allow in incognito," a *split*-less extension sees incognito tabs and could store their URLs in
  `storage.local` — a genuine privacy violation of PRV-001's spirit and a store policy problem.
- **Recommended default** — Set `"incognito": "not_allowed"` in the manifest for v0.1. That makes the
  guarantee structural rather than a code convention, and it is one line. Document it in the listing.

### B22. Multi-profile Chrome: is per-profile isolation of settings/locks acceptable? **P2**

- **Why it matters** — Users with work/personal profiles get two independent installs with independent
  settings and no shared configuration. That is normal for extensions but should be stated.
- **Recommended default** — Accept per-profile isolation. Provide **Export/Import settings as JSON**
  in the Settings view (a 30-line feature) so a user can replicate configuration across profiles and
  machines, and so bug reporters can attach their (URL-free) configuration. Keep the export free of
  recovery URLs by default with an explicit "include recovery history" checkbox.

### B23. Sync across the user's own devices is out of scope. Is that acceptable long term, and does it change the storage design now? **P2**

- **Why it matters** — `chrome.storage.sync` is a Google-provided sync with no backend of your own
  (100 KB total, 8 KB/item, write-rate quotas), so "settings sync" is achievable without violating the
  no-backend principle. Deciding later is fine; choosing storage keys now that make it easy is free.
- **Recommended default** — v0.1 stays `storage.local`. Keep `settings:v1` small (<8 KB) and free of
  URLs so it can be moved to `storage.sync` in a later version by changing one adapter. Never sync
  tab records, locks, activity, or recovery (they contain URLs).

### B24. Bulk close of >5 tabs requires confirmation. Does bulk *sleep* or bulk *unlock* need confirmation, and is there an upper bound on a bulk selection? **P2**

- **Recommended default** — Confirm destructive-only (close). Bulk unlock of >10 tabs also gets a
  confirmation (it silently removes protection from many tabs, which is destructive at one remove). Cap
  a single bulk operation at 200 tabs and chunk the execution (see C17).

### B25. Onboarding is three lines of copy. Where does it live, and can it even open automatically? **P1**

§10 specifies the text and the "Enable automatic management" gate; §11.1 says the side panel is the
primary surface.

- **Why it matters** — **`chrome.sidePanel.open()` may only be called in response to a user gesture**,
  so the extension *cannot* auto-open the side panel on install. If onboarding lives only in the panel,
  a new user sees nothing after installing and may never find the extension. Also, `onInstalled` is the
  only reliable first-run hook.
- **Recommended default** — On `onInstalled(reason === "install")`, call
  `chrome.tabs.create({ url: "onboarding.html" })` — a full-page welcome that (1) explains sleeping vs
  closing in the PRD's exact words, (2) shows the two thresholds with editable values, (3) has the
  "Enable automatic management" button, (4) explains the trust model (nothing leaves your device, no
  page content read, recovery for 30 days), (5) tells the user to pin the toolbar icon and shows the
  keyboard shortcut, and (6) offers "Start in report-only mode for 7 days" (see F3). Also render a
  compact onboarding state inside the panel for users who reach it there first.

---

## Section C — Chrome extension API technical risks

Verified against current Chrome extension documentation where noted. Items marked **verify** are ones I
would not ship without an empirical check in a real browser; a concrete verification checklist is in
Section J.

### C1. `chrome.tabs.discard()` can silently no-op: it resolves with `undefined` rather than rejecting. Does the error handling account for that? **P0-BLOCKER**

The API is `chrome.tabs.discard(tabId?): Promise<Tab | undefined>`, and the docs state the tab "is
discarded **unless it is active or already discarded**." FR-004's acceptance criterion "An
already-discarded tab does not generate an error" is therefore accidentally correct — but for the wrong
reason, and the spec's `TAB_DISCARD_FAILED` path will never trigger for these cases.

- **Why it matters** — A silent no-op means the extension writes a `TAB_SLEPT` activity event for a tab
  that was never slept, corrupting the feed the whole trust model depends on, and the tab keeps its
  memory. It also means the local success metrics in §6.2 are wrong.
- **Recommended default** — Treat the result as authoritative:
  `const t = await chrome.tabs.discard(id); if (!t || t.discarded !== true) → TAB_DISCARD_FAILED` (and
  do not write a success event). Additionally re-`get` the tab if `t` is undefined, in case Chrome
  returns undefined while having succeeded. Only count tabs that verifiably transitioned.

### C2. Which tabs will Chrome refuse to discard in practice? **P0-TRUST / verify**

Documented refusals: active tabs, already-discarded tabs. Undocumented/uncertain: tabs holding a
media/mic/camera capture, tabs sharing the screen, tabs with `beforeunload` handlers or unsaved form
input, tabs with active downloads, PDF viewer tabs, tabs mid-load.

- **Why it matters** — Two opposite risks. If Chrome refuses, you get noisy `TAB_DISCARD_FAILED` errors
  and a broken sleep feature for those tabs. If Chrome complies, the extension can **drop an in-progress
  video call in which the user is muted** (`tab.audible === false` when nobody is speaking and the user
  is muted). The PRD's audible-only guard is not sufficient protection for calls.
- **Recommended default** — Do not rely on Chrome's protection. Implement the B13 "never sleep" host
  list seeded with meeting/chat/mail hosts, skip `status === "loading"` tabs, and treat any
  discard that returns `undefined` as a soft skip (log at most one `WARNING` per tab per day to avoid
  feed spam). Add verification tasks J1–J4.

### C3. `tab.lastAccessed` requires Chrome 121, but `minimum_chrome_version` is 116. **P0-BLOCKER**

Confirmed: `tabs.Tab.lastAccessed` is **Chrome 121+**. FR-002 makes it the primary bootstrap for activity
timestamps.

- **Why it matters** — On Chrome 116–120 the field is `undefined`, so every tab bootstraps to
  "first observed now," which combined with B9 makes auto-close effectively dead on those versions —
  a silent behavioral difference you would never notice on your own up-to-date machine.
- **Recommended default** — Set `"minimum_chrome_version": "121"`. It is a strictly better floor anyway:
  it also covers `chrome.alarms` 30-second minimum (120), `storage.local` 10 MB (114),
  `storage.session` 10 MB (112), `sidePanel.open()` (116), and longer SW lifetimes (110). Losing pre-121
  users is irrelevant for a new extension; Chrome auto-updates. Also code defensively:
  `tab.lastAccessed ?? now`.

### C4. Is `tab.lastAccessed` meaningful for background-opened tabs? **P1 / verify**

Per the W3C WebExtensions discussion and the Chromium change referenced there, `lastAccessed` is set to
the tab's creation time when a tab has never been accessed, and it is populated even for
background-opened tabs.

- **Why it matters** — It cannot be used to detect "never actually viewed" (B8), and it cannot be used to
  detect "restored from a previous session with an old access time" — so it is a weaker bootstrap than
  the PRD assumes.
- **Recommended default** — Use `lastAccessed` only as a *floor* for tabs discovered at startup, always
  combined with the URL-keyed ledger from B9, and rely on `onActivated`/`onFocusChanged` as the source of
  truth going forward.

### C5. The MV3 service worker terminates after ~30 seconds idle. Does a 5-minute alarm plus event-driven writes actually work? **P1**

Confirmed behavior: termination after 30s of inactivity, where any event or extension API call resets the
timer; the old hard 5-minute cap was removed in Chrome 110, but a single request taking >5 minutes is
still terminated.

- **Why it matters** — The design in §18 is correct (alarms wake the worker; state is persisted). The
  practical hazards are: (a) a sweep over 500+ tabs that awaits many `chrome.tabs.*` calls must keep
  making API calls or complete within the budget; (b) SW globals like `sweepInProgress` (§16) are lost on
  termination, so the mutex is unreliable across restarts; (c) `setTimeout`-based debouncing in the SW
  silently dies.
- **Recommended default** — Keep the SW-global mutex **and** a `storage.session` lease
  (`sweepLease: { startedAt, id }`) with a 60-second stale-lease takeover, per §16's own suggestion.
  Chunk sweeps (C17). Never use `setTimeout` in the SW for anything longer than a few hundred ms; use
  one-shot alarms (`when: Date.now() + graceMs`) if you ever need precise post-grace timing. Note that
  the coarse-grained 5-minute alarm means the *effective* grace period is `grace + up to 5 minutes` —
  acceptable, but it should be stated in the UI ("about 10 minutes").

### C6. `chrome.alarms` minimum granularity and reliability. **P1**

Confirmed: minimum interval is 30 seconds since Chrome 120 (`periodInMinutes: 0.5`); before that, 1
minute; Chrome "may delay them an arbitrary amount more"; alarms "generally persist until an extension is
updated" but "may be cleared when the browser is restarted."

- **Why it matters** — The 5-minute sweep is comfortably legal. But (a) alarms can be delayed
  arbitrarily (battery saver, heavy load), so nothing may be time-precise; (b) alarms do not fire while
  Chrome is closed; (c) the DEV_FAST_LIFECYCLE profile in §30.3 uses 1-minute values, which is fine but
  the *sweep* cannot be faster than 30s.
- **Recommended default** — Keep `periodInMinutes: 5`. Verify-and-recreate the alarm on every SW start
  (as §18 says) **and** on `onStartup`, `onInstalled`, and every `RUN_LIFECYCLE_SWEEP`. Add a dev-mode
  alarm period of 0.5 min behind a build flag. Never assume an alarm fired on time; always recompute from
  timestamps (the PRD's design already does this correctly).

### C7. Can the toolbar action both open *and* close the side panel? **P1**

Confirmed: `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` makes clicking the
action **toggle** the panel — but then `chrome.action.onClicked` never fires. `sidePanel.open()`
(Chrome 116+) must be called **synchronously** in a user-gesture handler (any `await` before it loses the
gesture, a known Chrome quirk), and `sidePanel.close()` only exists in very recent Chrome (~141+).

- **Why it matters** — §11.1's requirement ("the toolbar icon opens or closes the side panel") is only
  cleanly achievable via `setPanelBehavior`, which forecloses ever doing anything else on action click.
  If you instead handle `action.onClicked` yourself, you get open-only behavior on Chrome 121–140.
- **Recommended default** — Use `setPanelBehavior({ openPanelOnActionClick: true })`, called at every SW
  startup and in `onInstalled` (it is an upsert and persists, but re-asserting is cheap). Do not add
  `default_popup`. Accept that `action.onClicked` is unavailable and put all UI in the panel. Add
  `_execute_action` to `commands` so there is a keyboard way to open the panel.

### C8. Does `tabs.onUpdated` reliably fire for discarded-state changes? **P1 / verify**

Confirmed: `changeInfo.discarded` exists (Chrome 54+), as do `audible`, `autoDiscardable`, `favIconUrl`,
`pinned`, `status`, `title`, `url`, `groupId`, and `frozen` (Chrome 132+).

- **Why it matters** — The PRD depends on `onUpdated` to keep `discarded` fresh. Historical Chrome bugs
  exist around discard-related events and around whether a discarded tab's `title`/`favIconUrl` remain
  populated. If the panel shows stale state, the whole control center feels broken.
- **Recommended default** — Do not treat events as the sole source of truth: every sweep re-queries
  `chrome.tabs.query({ windowType: "normal" })` and reconciles the full set (cheap, ~1 call), and the
  panel calls `GET_APP_STATE` on mount, on `visibilitychange`, and on a 30-second low-frequency refresh
  in addition to broadcasts. Events optimize latency; the query establishes truth.

### C9. Waking a discarded tab without focusing it. **P1 / verify**

- **Why it matters** — Needed for A7's `WAKE_TAB` and for undoing a sleep.
- **Recommended default** — `chrome.tabs.reload(tabId)` on a discarded tab should load it in place
  without activating it (**verify**; if it does not work, fall back to
  `chrome.tabs.update(tabId, { url: tab.url })`, and if that also fails, hide the Wake action and make
  Undo for sleep a no-op with an explanatory toast).

### C10. Chrome 132+ adds a `frozen` tab state. Should the state model account for it? **P2**

Confirmed: `Tab.frozen` (Chrome 132+) — "a frozen tab cannot execute tasks... its content is loaded in
memory. It is unfrozen on activation."

- **Why it matters** — `frozen` is a third lifecycle state between loaded and discarded that Chrome
  applies on its own. A frozen tab is not `discarded`, so the extension will display it as `BACKGROUND`
  and may try to discard it (which should work). Purely cosmetic today, but the five-state model in §9.1
  is now incomplete relative to the browser.
- **Recommended default** — Store `frozen` on the record, do not add a display state; optionally show a
  small "frozen by Chrome" hint. Revisit if Chrome exposes a freeze API.

### C11. `tabs.onReplaced` — when does it actually fire, and is metadata transfer implementable? **P1 / verify**

The docs say it fires "when a tab is replaced with another tab due to prerendering or instant."

- **Why it matters** — §17 requires transferring metadata from old to new tab ID "when possible." Since
  `onReplaced` gives only `(addedTabId, removedTabId)`, and the removed tab's record is still in storage,
  this is implementable — *if* the handler runs before the `onRemoved` cleanup. Ordering between
  `onReplaced` and `onRemoved` is not guaranteed by the docs.
- **Recommended default** — Make record deletion lazy: on `onRemoved`, mark the record
  `removedAt = now` and delete it at the end of the next sweep (a ~5-minute tombstone). Then
  `onReplaced` can always find the old record and copy `lastActivatedAt`, `neverActivated`,
  `pendingCloseAt`, and the lock binding onto the new id. Tombstones also fix the
  "close succeeded but activity write failed" edge case in §29.

### C12. Storage quota math: `maximumActivityEvents: 1000` with aggregate events containing up to 500 tab snapshots will blow the 10 MB `storage.local` quota. **P0-BLOCKER**

Confirmed quota: `storage.local` `QUOTA_BYTES = 10485760` (10 MB since Chrome 114); writes that exceed it
**fail** and reject. `unlimitedStorage` is explicitly forbidden by §21.

- **Why it matters** — A single "put 500 tabs to sleep" event with 500 `TabSnapshot`s (title + URL +
  favicon URL ≈ 200–400 bytes each) is 100–200 KB. A few dozen such events approach the quota; 1000
  events could exceed it by an order of magnitude. When the quota is hit, **all** writes fail —
  including the recovery snapshot that must exist before a tab is closed (§29). That turns a storage
  bug into data loss.
- **Recommended default** —
  - Cap `tabs[]` at **20** snapshots per event plus `metadata.totalCount`; the feed says "and 480 more."
  - Strip `favIconUrl` from snapshots entirely (use the favicon API instead — C13).
  - Enforce a **byte budget**, not just a count: after each activity write, if
    `chrome.storage.local.getBytesInUse()` exceeds ~4 MB, trim oldest events until under budget. Same
    for recovery records (which the PRD gives no maximum at all — G5).
  - Wrap every write in a quota-aware helper that, on `QUOTA_BYTES` failure, trims history and retries
    once before surfacing `STORAGE_WRITE_FAILED`.
  - Split activity storage into chunked keys (`activityEvents:v1:<bucket>`, e.g. one key per 100 events)
    so appending an event does not rewrite the entire history (PERF-004 asks for this implicitly).

### C13. The side panel rendering `tab.favIconUrl` makes outbound network requests to third-party sites — contradicting PRV-001. **P0-TRUST**

`favIconUrl` is usually a remote `https://` URL. Rendering `<img src={tab.favIconUrl}>` in the panel makes
the browser fetch it (possibly from network, with cookies suppressed but with your IP), for every tab in
the list.

- **Why it matters** — PRV-001 says "No data may leave the local browser profile." Fetching favicons
  discloses, to each site, that a client is enumerating its favicon — and in the worst case a
  favicon URL is a tracking endpoint. It also fails your own privacy story on the store listing, which
  under the August 2026 CWS policy update must be accurate and "prominently disclosed."
- **Recommended default** — Add the **`favicon`** permission and render
  `chrome.runtime.getURL("/_favicon/?pageUrl=<encoded>&size=32")`, which is served from Chrome's local
  favicon cache. Verified: the `favicon` permission **does not add a new permission warning when `tabs`
  is already requested** — so this is free at install time. Because adding permissions after publishing
  disables the extension for existing users (D11), **this must be decided before v1.0**. This is a
  justified deviation from §21's permission list; document it.

### C14. Can a page context-menu item reliably act on "the active tab"? **P1**

FR-003 requires a page context-menu lock command.

- **Why it matters** — `contextMenus.onClicked` provides `(info, tab)`, and `tab` is the tab where the
  click happened — which is the correct target and is more reliable than querying for the active tab.
  But: the page context menu does not appear on `chrome://` pages, may be suppressed by pages that
  intercept right-click, and `info.pageUrl` reflects the frame. Also §12's "context-menu label reflects
  the current tab state when practical" requires updating the menu title on tab activation, which means
  `contextMenus.update()` on every `onActivated` — a write on a hot path.
- **Recommended default** — Use the `tab` argument, never a query; if `tab` is undefined, fail with
  `TAB_NOT_FOUND`. Register menus in `onInstalled` after `contextMenus.removeAll()` (prevents the
  duplicate-item bug §30.2 tests for). Use a **static** label ("Toggle keep-this-tab") to avoid
  per-activation updates; if you want a dynamic label, throttle updates to activation events only and
  ignore failures. Also add the same command under the `action` context so it is reachable by
  right-clicking the toolbar icon (works even on `chrome://` pages).

### C15. `file://` tabs: manageable, discardable, restorable? **P2 / verify**

Not addressed by §5.6.

- **Why it matters** — Closing a `file://` tab and restoring it via `chrome.tabs.create({ url: "file://…" })`
  may be blocked unless the extension has "Allow access to file URLs" enabled (a user-toggled setting).
  A recovery record that cannot be restored is a trust bug.
- **Recommended default** — Treat `file://` as `canDiscard: true`, `canClose: false` in v0.1 (never
  auto-close local files; users often keep long-lived local reports/notes open). That sidesteps the
  restore question entirely. Note it in known limitations.

### C16. `chrome.tabs.remove()` and `beforeunload`: will the user ever be prompted, and can a page block automatic closure? **P1 / verify**

- **Why it matters** — If extension-initiated removal skips `beforeunload` (the likely behavior), pages
  with unsaved work close silently — no dialog, no chance to intervene. If it *does* prompt, an automatic
  sweep could produce a surprise modal dialog on an unrelated window, which would be much worse.
- **Recommended default** — Assume no prompt and no page veto. Compensate with conservative thresholds,
  the recovery snapshot, the B17 skip list, and explicit onboarding copy ("automatic closing does not
  ask the page to confirm; unsaved work in an old tab can be lost"). Verify empirically (J6).

### C17. Blast-radius and jank when acting on hundreds of tabs at once. **P1**

PERF-003 addresses storage writes over 500 tabs, but nothing bounds the number of *Chrome API mutations*
per sweep.

- **Why it matters** — `Promise.all` over 300 `discard()` calls will spike CPU, and 60 simultaneous
  `remove()` calls is both janky and a terrifying user experience. It also risks the SW's 5-minute
  single-request ceiling.
- **Recommended default** — Process actions in sequential chunks of 10 with a `await sleep(50)` between
  chunks, hard-cap discards at 50 per sweep and closures at 10 per sweep (B2), and carry the remainder to
  the next sweep. Log the deferral in the panel header rather than the activity feed.

### C18. System clock changes, NTP jumps, and DST: can inactivity go negative or explode? **P1**

Everything in the PRD uses `Date.now()` epoch math.

- **Why it matters** — A clock correction backward makes `now - lastActivatedAt` negative (harmless); a
  jump forward (fixing a wrong clock, or a VM/laptop resuming) makes every tab instantly ancient and can
  trigger a mass close. Timezone/DST do not affect epoch math but do affect the displayed times.
- **Recommended default** — Clamp: `inactiveMs = max(0, now - lastActivatedAt)`. Detect implausible
  jumps by comparing the alarm's expected fire time to `Date.now()`; if the gap exceeds 2× the period,
  treat it as downtime (B2 layer 2) rather than inactivity. The per-sweep closure cap is the backstop.

### C19. Does `chrome.commands` `Ctrl+Shift+L` actually register on all platforms, and what if it collides? **P1**

- **Why it matters** — Chrome silently drops a suggested shortcut if another extension claimed it first
  (first-installed wins), so the "keyboard shortcut works" acceptance criterion can fail on a user's
  machine with no error anywhere. There is also a limit of 4 suggested-key commands, and some
  combinations are reserved by Chrome. `Ctrl+Shift+L` is not reserved but is commonly claimed
  (e.g. by clipboard/password extensions and by some Linux desktop environments).
- **Recommended default** — Keep `toggle-tab-lock` but change the suggested key to `Alt+Shift+L`
  (Windows/Linux) / `Command+Shift+E`… actually, safest is to ship **no** `suggested_key` for
  `toggle-tab-lock` and one for `_execute_action` (`Alt+Shift+T` / `Command+Shift+T`… note
  `Command+Shift+T` is Chrome's reopen-closed-tab, so use `Alt+Shift+T` on all platforms). Then surface
  a Settings row: "Set keyboard shortcuts →" that links to `chrome://extensions/shortcuts` (the link must
  be opened with `chrome.tabs.create`; anchors to `chrome://` are blocked). Detect unbound commands with
  `chrome.commands.getAll()` and show a hint if the shortcut is empty.

### C20. Multiple side panels (one per window) all messaging the service worker. Are broadcasts and errors handled? **P1**

- **Why it matters** — The side panel is per-window, so a user with 4 windows can have 4 live panel
  documents. `chrome.runtime.sendMessage` from the SW with no listener throws
  "Could not establish connection. Receiving end does not exist," which appears as an unhandled rejection
  and, in MV3, spams the SW console (and can be surfaced as an extension error to users).
- **Recommended default** — Always `.catch(() => {})` broadcast sends. Consider `chrome.runtime.connect`
  ports from each panel instead (the SW keeps a `Set<Port>`, cleans up on `onDisconnect`), which also
  gives you a natural keep-alive while a panel is open and avoids the no-receiver error entirely.
  Guard against concurrent conflicting bulk actions from two panels by making all mutations go through
  the SW's serialized queue (they already do) and having panels re-render from broadcast state.

### C21. `chrome.storage.local` vs `chrome.storage.session` for tab records. **P1**

§15 puts `tabRecords:v1` in `local`.

- **Why it matters** — Tab IDs are session-scoped, so persisting tab records to disk guarantees a pile of
  stale records at every startup (which FR-011 then has to clean up), writes URLs to disk unnecessarily
  (privacy surface), and burns disk I/O every 5 minutes. `storage.session` (10 MB, in-memory, survives
  SW termination but not browser restart) is exactly the right tool and is what the Chrome team
  recommends for service-worker state.
- **Recommended default** — `storage.session`: `tabRecords`, `closingTabIds`, `sweepLease`,
  `lastSweepCompletedAt` (mirror to local for downtime detection). `storage.local`: `settings`,
  `lockRecords`, `activityEvents` (chunked), `recoveryRecords`, `activityLedger` (B9), `migrationVersion`,
  `browserStartedAt`, `lastSweepCompletedAt`. Deviation from §15; document it.

### C22. Is `minimum_chrome_version: 116` justified, and what exactly justifies the floor? **P1**

- **Recommended default** — Raise to **121** (C3). Justification chain to record in the README:
  `sidePanel` 114, `sidePanel.open()` 116, `storage.local` 10 MB 114, `alarms` 30 s minimum 120,
  `tabs.Tab.lastAccessed` 121. Do not go to 132 for `frozen` (cosmetic only).

### C23. Vite dev server and MV3 CSP: how will the developer actually iterate? **P1**

§23 recommends Vite; nothing addresses the dev loop.

- **Why it matters** — MV3's `extension_pages` CSP forbids remote script, so a Vite dev server with HMR
  cannot serve the panel's scripts. Extensions built with naive `vite build` also break when the service
  worker is code-split into dynamic chunks, and MV3 requires the SW to be a real ES module or a single
  bundle.
- **Recommended default** — `vite build --watch` plus a manual reload, with `rollupOptions.input` for
  `sidepanel.html`/`onboarding.html` and a separate bundling step for the SW with
  `inlineDynamicImports: true` (or the `@crxjs/vite-plugin` if it is currently healthy — evaluate, do not
  assume). Never ship a build that requires `'unsafe-eval'`; verify the packaged zip contains no `eval`
  and no remote URLs (this is also a store-review item — D8).

---

## Section D — Distribution and Chrome Web Store readiness (the largest gap)

The PRD's line "**Initial distribution: Locally loaded unpacked extension**" is the only sentence about
distribution, and §34's Definition of Done stops at "can be loaded unpacked." None of the following is
covered anywhere in the document.

### D1. Do you have a Chrome Web Store developer account, and who is the publisher of record? **P0 for release**

- **Why it matters** — Publishing requires a Google account, a one-time **$5** registration fee, and
  2-Step Verification on the account. Group publishers exist but complicate things for a solo dev. The
  publisher display name appears on the listing.
- **Recommended default** — Register a dedicated Google account for publishing (not your primary
  personal account), enable 2SV with a hardware or authenticator second factor, and pay the fee **early**
  — account setup and verification are the kind of thing that blocks release day. Publisher display
  name: your name or a simple project name; keep it consistent with the GitHub org.

### D2. Will you declare **trader** or **non-trader** status? **P0 for release**

- **Why it matters** — Every CWS developer must declare trader status (EU DSA). Declaring **trader**
  requires publishing verified contact details — including a **physical address** — publicly on your
  listing. Declaring **non-trader** avoids that but can restrict distribution/visibility in the EU, and
  is only honest if you are not acting commercially. Failing to declare at all can get items removed
  from EU availability.
- **Recommended default** — Declare **non-trader** for a free, no-monetization extension, and accept
  possible EU limitations. Revisit if you ever add payment, donations tied to functionality, or ads.
  Record the decision in the repo so future-you does not re-litigate it.

### D3. Where will the privacy policy live, and what will it say? **P0 for release**

- **Why it matters** — The listing has a Privacy practices tab requiring a single-purpose statement,
  a justification for **each** permission, a remote-code declaration, data-use disclosures, three
  certifications, and a **privacy policy URL** whenever you handle user data. Browsing-activity-adjacent
  extensions are scrutinized. The August 1, 2026 policy update tightened this further: data collection
  must be *strictly necessary* to the disclosed single purpose, all collection must be *prominently
  disclosed*, and developers must *proactively notify users* if data handling changes after install.
  Also: if the privacy fields contradict the policy or the extension's actual behavior, the item can be
  removed.
- **Recommended default** — Publish `PRIVACY.md` as a GitHub Pages URL (stable, free, versioned) and
  link it. Content: what is stored (tab URLs/titles, settings, activity, recovery records), where
  (`chrome.storage.local`, on-device only), why, retention (30 days, user-clearable), what is never
  collected (page content, form data, cookies, screenshots), zero network transmission, no analytics, no
  third parties, how to delete everything (uninstall or the in-app Clear buttons), and a contact address.
  Declare "does not collect user data" only if you also state plainly in the policy that URLs are stored
  locally — locally-stored-only is generally not "collection," but the disclosure must be
  unambiguous, and getting this wrong is a removal risk.

### D4. What is the exact permission-justification text for review? **P1**

- **Why it matters** — Weak justifications are the most common cause of review friction, and the `tabs`
  permission generates the "**Read your browsing history**" install warning, which is your biggest
  install-conversion obstacle for a tab manager.
- **Recommended default** — Draft now, keep in `store/LISTING.md`:
  - **Single purpose**: "Manage the lifecycle of the user's open browser tabs: show their state, let the
    user protect individual tabs, unload inactive tabs from memory, and close long-abandoned tabs with a
    recoverable history."
  - `tabs`: "Required to enumerate open tabs and read their title, URL, window, pinned, audible, and
    discarded state in order to display them in the side panel and to apply the user's configured sleep
    and close rules. Titles and URLs are only stored locally and never transmitted."
  - `storage`: "Stores the user's settings, protected-tab list, local activity history, and the recovery
    list of tabs the extension closed, entirely on the user's device."
  - `alarms`: "Runs the periodic lifecycle check every 5 minutes; required because Manifest V3 service
    workers are not persistent."
  - `sidePanel`: "The extension's entire user interface is a side panel."
  - `contextMenus`: "Adds a right-click item to protect the current tab from automatic closing."
  - `favicon`: "Displays site icons in the tab list from Chrome's local favicon cache, so the extension
    never makes network requests to third-party sites."
  - **Remote code**: "No, I am not using remote code." (Must be true — D8.)
  - **Host permissions**: none requested — say so explicitly, it helps.

### D5. What listing assets are required, and do they exist? **P1**

- **Why it matters** — A missing icon or screenshot is an automatic rejection. Requirements: a
  **128×128** store icon; **at least one 1280×800** (or 640×400) screenshot, full-bleed with square
  corners, up to 5; a **440×280** small promo tile; optionally a 1400×560 marquee tile (required to be
  eligible for marquee featuring) and a YouTube link. Promo images go through their own review, which can
  take up to a week, and images on Draft/Trusted-tester items are not reviewed until you publish.
- **Recommended default** — Produce, in the repo under `store/`: the four extension icons (16/32/48/128),
  the 128 store icon, a 440×280 tile, and 4–5 1280×800 screenshots: (1) the panel showing a mixed tab
  list with states, (2) the pending-close row with the reason visible, (3) the Activity feed, (4) the
  Recovery view with a restore, (5) Settings showing the safety guarantees. Screenshots must be real UI,
  not mockups, and should avoid showing your actual personal tabs — build a demo profile with innocuous
  tabs. Budget real time for this; it is usually underestimated.

### D6. Is the name "Tab Lifecycle Manager" available and defensible? **P1**

- **Why it matters** — CWS does not enforce unique names, but a name collision with an established
  extension hurts discovery and can trigger an impersonation review. Google's policies prohibit using
  "Chrome"/Google branding in the name or icon. The space is crowded (Tab Wrangler, Tab Suspender,
  Auto Tab Discard, Tabby, Session Buddy…).
- **Recommended default** — Search the CWS for "tab lifecycle", "tab manager", "tab suspender" before
  committing; pick a distinct product name plus a descriptive tagline (the *listing* name field carries
  the SEO weight; the manifest `name` should match). Do not include "Chrome," "Google," or the Chrome
  logo/colors. Keep the display name ≤ ~30 visible characters so it is not truncated in the store tile.
  Do a quick trademark sanity check on any invented name.

### D7. Does the extension satisfy the single-purpose policy? **P1**

- **Why it matters** — Side panel + context menu + keyboard command + recovery history is one purpose
  (tab lifecycle). The risk arises later: adding bookmarks promotion (v0.4), "research collections"
  (v0.6), or AI classification (v0.7) could read as a second purpose or expand data collection beyond
  what the August 2026 Limited Use rule allows.
- **Recommended default** — Write the single-purpose sentence (D4) and treat it as a constraint on the
  roadmap, not just a form field. Anything that requires new data collection needs a listing update and
  a proactive user notification under the 2026 policy — plan the "What's new / data practices changed"
  surface now (see M6 in the plan).

### D8. Does the packaged build contain any remote code, `eval`, or unbundled dependency? **P1**

- **Why it matters** — Remote code is prohibited; a CDN font, a remote sourcemap reference, or a
  library that uses `new Function()` can trigger rejection. Vite dev artifacts can include `eval`.
- **Recommended default** — Add a pre-package CI check that greps the built output for `eval(`,
  `new Function(`, `http://`, `https://` script/style URLs, and `sourceMappingURL` pointing off-disk;
  fail the build on a hit. Bundle fonts or use system font stacks. Ship non-minified or lightly minified
  output (readable code speeds review); never obfuscate.

### D9. What is the versioning and update strategy? **P1**

- **Why it matters** — CWS versions must be 1–4 dot-separated integers (0–65535) and must strictly
  increase; you cannot re-upload the same version, and you cannot roll back. Chrome auto-updates
  installed extensions (checked roughly every few hours), so a bad release reaches everyone.
  Published-item updates support a **staged rollout percentage** — the only real safety net you have.
- **Recommended default** — Semver-ish `MAJOR.MINOR.PATCH` in the manifest, a `CHANGELOG.md`, git tags
  matching the manifest version (CI-enforced), and every functional update published at **10% → 50% →
  100%** over several days while you watch reviews. Keep a `KILL_SWITCH`-free design: since there is no
  backend, your only remedy for a bad release is a fast follow-up version — so the local
  `automationPaused` flag and the conservative caps in B2 are your real mitigations.

### D10. Should the manifest contain `key` or `update_url`? **P1**

- **Why it matters** — Unpacked loads get a random extension ID, which changes the `_favicon/` URL base
  and any documentation you write. Adding the CWS item's public `key` to the manifest makes the local
  unpacked ID match the published ID — very useful for testing favicons, docs, and support. `update_url`
  must **not** be set for CWS-hosted items (it is only for self-hosted `.crx` distribution) and its
  presence can confuse review.
- **Recommended default** — Create the CWS item early (as a Draft) to obtain the item ID and public key;
  inject `key` into the manifest **for development builds only** via the build script, and omit both
  `key` and `update_url` from the uploaded zip. Document the ID in the README.

### D11. Which permissions might you want later, and are you willing to have the extension disabled to add them? **P0 for release**

- **Why it matters** — Confirmed Chrome behavior: if an update adds a permission that produces a **new
  warning**, Chrome **disables the extension** for existing users until they manually re-accept. Many
  users never do. Permissions that are "messageless" or collapse into already-granted warnings do not
  trigger this. So your v1.0 permission set is a near-permanent commitment.
- **Recommended default** — Decide the full set **now**:
  - Include in v1.0: `tabs`, `storage`, `alarms`, `sidePanel`, `contextMenus`, **`favicon`** (no extra
    warning given `tabs`; needed for C13).
  - Consider including in v1.0: **`sessions`** — it would let Recovery restore a closed tab *with its
    history and scroll position* via `sessions.restore`, a large UX win over `tabs.create`; its warning
    likely collapses into the `tabs` "browsing history" warning, but **verify with
    `chrome.management.getPermissionWarningsByManifest`** before deciding.
  - Decide explicitly about **`notifications`** (B19): it generates its own warning, so if you ever want
    OS notifications (v0.8 in the roadmap), including it at v1.0 costs nothing extra at install and
    saves a forced re-consent later. Recommend **including it and not using it yet only if** you are
    confident you will use it within a few releases; otherwise omit and accept the future re-consent.
    Default recommendation: **omit** (unused permissions are a review-risk and a trust-signal problem)
    and plan the re-consent as a deliberate release event.
  - Never: `unlimitedStorage`, host permissions, `scripting`, `bookmarks`, `history`, `webNavigation`.
  - Add a CI check that diffs the manifest permission list against a committed baseline and fails on
    change without an accompanying `PERMISSIONS_CHANGELOG.md` entry.

### D12. Where do users get support, report bugs, and read documentation? **P1**

- **Why it matters** — The listing has support/homepage URL fields; users leave 1-star reviews when
  there is nowhere else to go, and reviews are your only public feedback channel. You cannot reach a
  reviewer privately.
- **Recommended default** — A public GitHub repo with Issues enabled, issue templates (bug/feature),
  a `SUPPORT.md`, and a dedicated email alias. Set the listing's support URL to the Issues page and the
  homepage URL to the repo/Pages site. Add a "Report a problem" link in the panel's Settings view that
  opens a prefilled GitHub issue URL containing **only** version, Chrome version, OS, and tab counts —
  never URLs (see F5).

### D13. What license, and does it matter for the store? **P2**

- **Recommended default** — **MIT** (or Apache-2.0 if you want a patent grant). Add `LICENSE`, a
  `NOTICE`/third-party attribution file for bundled deps, and note that publishing to CWS does not
  require open-sourcing. Being open source is itself a strong trust signal for an extension holding the
  "read your browsing history" warning — link the repo prominently in the listing.

### D14. Will reviewers be able to see the product work, given a 7-day default close threshold? **P2**

- **Why it matters** — A reviewer installs, clicks around for a few minutes, and can observe the panel
  and manual actions but never automation. That is fine (the manual UI is substantial), but if the
  listing screenshots emphasize automatic closing, the mismatch invites questions.
- **Recommended default** — Make the panel immediately valuable and self-evident on first open, describe
  automation clearly in the description, and mention in the permission justification that automation
  is user-enabled and configurable. Do not add a "demo mode" hack.

### D15. Do you need i18n / a `default_locale`? **P2**

- **Recommended default** — English-only for v1.0, but put all user-facing strings in one
  `src/shared/strings.ts` module so a later move to `_locales` is mechanical. Do not add `_locales` yet
  (it complicates the manifest name/description and the listing).

### D16. Should the extension set an uninstall URL or ask for feedback on uninstall? **P2**

- **Recommended default** — **No.** `chrome.runtime.setUninstallURL` fires a network request at uninstall
  time, which is inconsistent with the local-first promise and would need disclosure. Skip it.

### D17. What is the plan for other Chromium browsers (Edge, Brave, Opera, Arc)? **P2**

- **Recommended default** — Out of scope; users may install from CWS at their own risk. State in the
  README that only Chrome desktop ≥121 is supported, and that `sidePanel` behavior differs across
  Chromium forks. Do not test or promise Edge Add-ons store distribution in v1.

### D18. Is any of the extension's stored data a problem when multiple people use the same computer? **P2**

- **Why it matters** — Chrome profiles isolate storage, and the data is not encrypted at rest beyond OS
  disk protections. An activity feed and recovery list containing 30 days of URLs is a genuine local
  privacy artifact — e.g. on a shared machine, or in a forensic sense.
- **Recommended default** — Document it honestly in `PRIVACY.md`, keep the retention defaults at 30 days,
  make "Clear activity"/"Clear recovery" prominent (PRV-009 already requires them), and add a
  Settings option **"Do not store closed-tab URLs"** (recovery disabled) for privacy-sensitive users.

---

## Section E — Missing operational and product concerns for real usage

### E1. What happens with 1000+ tabs, beyond the 500-tab performance target? **P1**

PERF-001/002 target 200/500 tabs.

- **Why it matters** — The users who install a tab manager are exactly the people with 1500 tabs. At that
  scale: rendering without virtualization freezes the panel; `storage.session` tab records approach
  the 10 MB cap; a full sweep touches every record; and a first-run automation pass could try to close
  hundreds of tabs.
- **Recommended default** — Virtualize the tab list (`@tanstack/react-virtual`, ~3 KB — a justified
  small dependency despite §23's "avoid heavy state libraries," which this is not). Keep per-record
  payloads small (no favicon URLs, no page text). Test with a generated 1500-tab profile. Rely on the
  per-sweep caps (C17/B2) so scale degrades gracefully rather than catastrophically.

### E2. Is dogfooding-only validation of the destructive path sufficient? **P0-TRUST**

§30.3 provides a DEV_FAST_LIFECYCLE profile.

- **Why it matters** — Fast-lifecycle testing validates the mechanism, not the *policy*. The policy
  question ("would this have closed something I cared about?") can only be answered over real time, and
  the failure is unrecoverable in the user-trust sense.
- **Recommended default** — Ship a **report-only (dry-run) mode** and make it the default for the first
  7 days after onboarding: the sweep computes and records every action it *would* take
  (`RULE_SKIPPED`-style events with a "would close" marker), but performs no closures (sleeping still
  happens — it is non-destructive). After 7 days the panel prompts: "Here are the 34 tabs cleanup would
  have closed. Enable automatic closing?" This converts the scariest feature into an auditable one and
  is the single best pre-release safety mechanism available. It is also a great store screenshot.

### E3. How will you get feedback from third-party users without telemetry? **P1**

§6.2's success metrics are explicitly local and never leave the device.

- **Why it matters** — Your most important metric ("percentage of automatic closures later restored" — a
  direct measure of over-aggression) exists only on each user's machine. Without a voluntary path, you
  will fly blind and only hear from angry users.
- **Recommended default** — A Settings action **"Copy usage summary"** that puts a small, URL-free JSON
  blob on the clipboard (counts from §6.2, settings values, Chrome/extension version, tab-count buckets)
  which users can voluntarily paste into a GitHub issue or discussion. Zero network, opt-in by
  definition, and consistent with PRV-002. Ask for it in the release notes and in a pinned GitHub
  Discussion.

### E4. What error/crash reporting exists to debug problems reported by strangers? **P1**

The PRD has good error codes (§28) but no diagnostics surface.

- **Why it matters** — "It closed my tab and I don't know why" is unanswerable without the activity feed
  and error log, and you cannot ask a user to open a service-worker console.
- **Recommended default** — Local, opt-in, offline-only diagnostics: a bounded ring buffer (200 entries)
  of `{ ts, code, message, context }` with **URLs reduced to hostnames** (or SHA-256 prefixes) before
  storage; a "Copy diagnostic report" button; a "Download activity as JSON" export in the Activity view.
  No network. Explicitly document in `PRIVACY.md` that diagnostics never leave the device unless the user
  pastes them somewhere. Consider a redaction toggle "include hostnames / fully redact."

### E5. Should thresholds be configurable per window or per tab group later? **P2**

- **Recommended default** — Not in v0.1, but store `groupId` (B11) and design `ExtensionSettings` so a
  future `overrides: { byGroupId?, byHost? }` map can be added without a schema break. Note it as a
  planned v0.5 companion to domain locks.

### E6. What should the icon and branding be? **P2**

The PRD specifies icon *files* but never what they depict.

- **Recommended default** — A single simple mark that reads at 16px: a rounded tab silhouette with a
  crescent/moon or a small lock. Avoid Chrome's four colors and any resemblance to Chrome's logo. Produce
  a single SVG master and generate 16/32/48/128 + the 440×280 tile from it. Provide a distinct
  "automation paused" variant of the toolbar icon (grayscale) — a cheap, high-clarity trust signal
  (`chrome.action.setIcon`).

### E7. Is there a changelog and a "what's new" surface? **P2**

- **Recommended default** — `CHANGELOG.md` in the repo (Keep-a-Changelog format), plus on
  `onInstalled(reason === "update")` set a `whatsNewVersion` flag that shows a dismissible banner at the
  top of the panel linking to the changelog. Required in spirit by the 2026 CWS rule about proactively
  notifying users of data-handling changes.

### E8. Dark mode? **P1**

Not mentioned anywhere in §11 or §27.

- **Why it matters** — A side panel sits permanently adjacent to page content; a blinding white panel
  next to a dark IDE/site is an instant uninstall for a large fraction of the target audience (heavy tab
  users skew developer).
- **Recommended default** — Implement both themes with CSS custom properties and
  `@media (prefers-color-scheme: dark)` from the start (it is much cheaper to do at the beginning), plus
  a Settings override (System/Light/Dark).

### E9. What is the empty-state, first-run, and error-state UI? **P2**

`EmptyState.tsx` exists in §24's structure; no copy is specified.

- **Recommended default** — Write real copy for: no tabs match the filter; no activity yet; no recovery
  records; automation paused; automation not yet enabled; storage error; "Chrome could not put this tab
  to sleep." Keep them in `strings.ts`.

### E10. Is there any way for a user to see *why a tab was skipped*? **P2**

`RULE_SKIPPED` exists as an event type with no defined emission rule (see G7).

- **Recommended default** — Do not write skip events to the feed (it would flood). Instead, compute the
  skip reason on demand and show it inline in the tab row's detail/tooltip: "Not managed: pinned",
  "Protected", "Snoozed until Feb 3", "Never closes: mail.google.com". Same evaluator, zero storage
  cost, better answer to "why is this tab still here."

### E11. What happens if the user disables automation for months and then re-enables it? **P1**

FR-012 says resuming "triggers a fresh lifecycle evaluation but does not immediately bypass the close
grace period."

- **Why it matters** — Same mass-close hazard as B2: resuming after a long pause makes every tab
  instantly close-eligible; the 10-minute grace period is the only protection.
- **Recommended default** — On resume, apply the settling period and the per-sweep caps, and show a
  confirmation summarizing the blast radius: "Resuming will schedule 47 tabs for closing over the next
  hours. Review the list?" with a link to a pre-filtered tab view. Never resume silently into a large
  batch.

### E12. Should the extension do anything about *duplicate* tabs in v0.1 given it can already detect them? **P2**

Duplicate reuse is v0.2 (§4.6, §32).

- **Recommended default** — Detection but no action: show a "duplicate (3)" chip on rows sharing a
  normalized URL and offer a manual "Close duplicates, keep the most recently active" bulk action behind
  a confirmation. This delivers most of the value of v0.2 with none of the risky
  intercept-navigation machinery, and it exercises the `normalizedUrl` field (§20) that would otherwise
  be dead code in v0.1. Flag as a deviation; it is optional.

### E13. Is `chrome.sessions`-based restore worth reconsidering for Recovery? **P1**

§21 forbids the `sessions` permission; §5.8 accepts losing scroll position and history.

- **Why it matters** — Note that tabs closed by `chrome.tabs.remove()` land in Chrome's own
  "Recently closed" list, so `Ctrl+Shift+T` may already restore them *better* than the extension's own
  Recovery view does (with history and scroll position) — for a short window. If true, the extension's
  Recovery view is the durable long-tail mechanism and Chrome's is the high-fidelity short-tail one; the
  UI should say so, and `sessions.restore` would give you the best of both. See D11 for the permission
  timing constraint.
- **Recommended default** — v1.0 uses `tabs.create` as specified. Mention in the Recovery view: "Just
  closed? `Ctrl+Shift+T` may restore it with its full history." Evaluate `sessions` before v1.0 because
  of the permission-freeze problem, and record the decision.

### E14. Accessibility beyond §27: how does the panel behave at 320px width and with a screen reader on a 1500-row list? **P2**

- **Recommended default** — Design for a 320px minimum width (two-line rows, no horizontal scroll);
  give the list `role="list"` semantics with an `aria-live="polite"` summary of counts rather than
  announcing every row change; ensure the virtualized list keeps focus stable when items are removed
  (a classic virtualization + live-data a11y bug). Add one manual screen-reader pass to M4.

---

## Section F — Testing and rollout gaps

### F1. The 20 required unit tests cover the evaluator but nothing covers the *sweep orchestration*, which is where the dangerous bugs live. **P1**

- **Why it matters** — The evaluator is pure and easy; the risk is in the sweep: caps, chunking, lease
  handling, re-fetch-before-destroy, ordering of recovery write vs removal, and partial failure.
- **Recommended default** — Add an in-memory fake `chrome` (hand-rolled, ~150 lines, or `sinon-chrome`)
  and write orchestration tests: recovery record exists before `tabs.remove` is called; a tab that
  becomes active between evaluation and removal is not removed; a throwing `discard` does not abort the
  sweep; two concurrent sweeps do not double-close; a quota-exceeded write trims and retries; caps are
  respected; downtime re-anchoring produces zero closures immediately after a simulated 14-day gap.

### F2. Add invariant/property tests for the safety exclusions. **P1**

- **Recommended default** — Generate randomized `ManagedTabRecord`/`ExtensionSettings` pairs (a few
  thousand) and assert hard invariants: locked ⇒ never `CLOSE`/`SCHEDULE_CLOSE`; pinned/audible/active ⇒
  never `CLOSE`/`SLEEP`; `automationPaused` ⇒ only `NONE`/`CANCEL_CLOSE`; `!onboardingCompleted` ⇒ only
  `NONE`; unmanageable ⇒ no destructive action; `CLOSE` requires a pre-existing `pendingCloseAt ≤ now`.
  This is ~30 lines with `fast-check` and is the cheapest possible guard against §35 rule 15 being
  violated by a future refactor.

### F3. Is there a staged rollout / beta plan? **P1**

The PRD's roadmap ends at "This completes version 0.1" with no release step at all.

- **Recommended default** — Four stages: (1) **solo dogfood** 2 weeks with report-only closing, then real
  closing; (2) **CWS Private / trusted testers** (up to 100 emails) with 3–10 people you can talk to,
  2 weeks; (3) **CWS Unlisted** public-by-link, shared in one or two relevant communities, collect
  reviews/issues; (4) **Public** at 10% → 50% → 100% staged rollout. Do not skip stage 2; strangers'
  browsers have window/profile/PWA configurations you do not.

### F4. How will the manual integration checklist be executed repeatedly without becoming stale? **P2**

§30.2's 17-item manual list is good but will rot.

- **Recommended default** — Move it into `docs/MANUAL_TEST_PLAN.md` as a checklist with a "last run on
  version / Chrome version" header, and require it in the release checklist for any release that touches
  the sweep, storage, or manifest. Automate the subset Playwright can actually do (see F6).

### F5. What is the concrete privacy design of the diagnostics you will ask users for? **P1**

- **Recommended default** — Specified in E4. Additionally: never include full URLs in any exportable
  diagnostic by default; provide a redaction level selector; show the user the exact payload before they
  copy it (a `<pre>` block they can read), which is both honest and the best possible defense of the
  no-telemetry claim.

### F6. What can Playwright actually test here? **P2**

§23 lists Playwright for "limited end-to-end browser tests."

- **Why it matters** — Chromium via Playwright can load an unpacked extension in a persistent context,
  but it **cannot** drive Chrome's side-panel UI directly, and it cannot interact with `chrome://` pages.
  Overestimating this will waste time.
- **Recommended default** — Use Playwright for: launching with the built extension, opening
  `chrome-extension://<id>/sidepanel.html` **as a normal tab** and exercising the full React UI against
  a real service worker, creating/closing real tabs and asserting the list updates, and driving a
  fast-lifecycle automation cycle end to end. Skip trying to test the actual side-panel container, the
  toolbar action click, the context menu, and the keyboard command — those stay manual.

### F7. Is there a rollback plan for a bad published release? **P1**

- **Why it matters** — CWS has no rollback: you cannot re-publish an older version number, and you
  cannot force-update users.
- **Recommended default** — Keep the previous version's zip and source tag; on a bad release, publish
  `X.Y.Z+1` that is the old code with the version bumped, halt the staged rollout immediately, and rely
  on the conservative caps + `automationPaused` so the worst case is "automation does nothing" rather
  than "automation destroys tabs." Write this down in `docs/RELEASE.md`.

### F8. How will you test the update path itself? **P1**

- **Recommended default** — Explicitly rehearse: install v`N` unpacked, create pending closures and
  locks, then load v`N+1` and assert (a) locks/settings/activity/recovery survived, (b) pending closures
  were cleared per B1, (c) migrations ran once and are idempotent, (d) no duplicate context-menu items,
  (e) the alarm exists. Chrome's Extension Update Testing Tool can simulate a packaged update with a
  permission change — use it before any permission change ships.

---

## Section G — Data model, storage, and message-contract gaps

### G1. `ManagedTabRecord` is missing fields the implementation needs. **P1**

Missing: `groupId` (B11), `neverActivated` (B8), `discardedBy` (B14), `frozen` (C10),
`autoDiscardable`, `snoozedUntil` (B18), `mutedInfo`, `removedAt` tombstone (C11),
`pendingCloseScheduledAt` (A8), `inactivityCreditMs` (B2), `status`.

- **Recommended default** — Add all of the above now. Every one of them is either a safety input or a
  future-migration avoidance, and `schemaVersion` is already in place to make later additions cheap.
  Conversely, drop the per-record `schemaVersion` (it wastes bytes across 1500 records) and version at
  the *storage key* level, which §15 already does.

### G2. `TabLockRecord` has no `schemaVersion`, unlike every other record. **P2**

- **Recommended default** — Add it for consistency, or (better) version at the key level uniformly and
  remove per-record versions everywhere.

### G3. There is no record of *when* a pending closure was scheduled, only when it will fire. **P1**

- **Why it matters** — Needed for A8's grace-period re-anchoring, for "scheduled 3 minutes ago" in the
  UI, and for detecting a pending closure that has been pending implausibly long (a bug signal).
- **Recommended default** — Add `pendingCloseScheduledAt` and `pendingCloseRuleMinutes`.

### G4. `RecoveryRecord` has no maximum count and no `groupId`/`pinned`/`openerTabId`. **P1**

`maximumActivityEvents` bounds activity; nothing bounds recovery.

- **Recommended default** — Add `maximumRecoveryRecords: 500` to settings, enforce both the count cap and
  the byte budget (C12), and store `groupId` + `pinned` for future restore fidelity. Also add
  `restoredAt?: number` so the "% of closures later restored" metric (§6.2) is computable without
  cross-referencing the activity feed.

### G5. Storage writes are not transactional; what is the ordering guarantee for "recovery snapshot before removal"? **P1**

§29 requires the snapshot to exist before removal and acknowledges the activity write may fail.

- **Recommended default** — Strict sequence per closure, with `await` between each step: (1) write the
  recovery record; (2) add `tabId` to `closingTabIds` in session storage; (3) `chrome.tabs.remove`;
  (4) append the activity event; (5) remove from `closingTabIds`. If the SW dies between 3 and 4, the
  next reconciliation finds a recovery record whose `activityEventId` is unset and back-fills the event.
  Add `activityEventId?: string` to `RecoveryRecord` to make that reconciliation possible.

### G6. Message contract is missing several operations the UI requires. **P1**

Absent from §19: `WAKE_TAB` (A7), `SNOOZE_TAB` (B18), `UNLOCK_TABS`/`LOCK_TABS` (bulk lock exists in the
UI spec but only single-tab messages exist), `SET_HOST_RULE` (B17), `COMPLETE_ONBOARDING`,
`GET_ACTIVITY { cursor, limit }` (paging — 1000 events in one message is wasteful),
`EXPORT_DATA`/`IMPORT_SETTINGS` (B22), `GET_DIAGNOSTICS` (E4), `SET_KEEP_LOADED` (B12),
`CANCEL_PENDING_CLOSE` (a "not now" that is neither lock nor snooze), `OPEN_SHORTCUTS_PAGE`.

- **Recommended default** — Add them, and make bulk the primitive: `LOCK_TABS { tabIds }` with the
  single-tab case as `tabIds: [id]`. Version the message protocol with a `v: 1` field so a stale panel
  document (which can outlive an SW update) fails loudly instead of behaving oddly.

### G7. When is `RULE_SKIPPED` emitted? **P2**

- **Recommended default** — Never persist it (see E10); keep the enum member for the type's stability but
  document it as reserved, or remove it and add `WOULD_CLOSE` for report-only mode (E2).

### G8. `ActivityEvent.source` has no value for "automatic wake" or for report-only actions, and `metadata` is `Record<string, string|number|boolean>` which cannot hold the per-tab reason detail. **P2**

- **Recommended default** — Add `source: "AUTOMATIC_MAINTENANCE"` (retention cleanup, migrations) and
  `"AUTOMATIC_REPORT_ONLY"`. Keep `metadata` flat but add `reasonsByTabId?: Record<string, string>` if
  you need per-tab detail in aggregate events; cap its size along with `tabs[]`.

### G9. Nothing specifies how the activity feed is *read* efficiently. **P2**

- **Recommended default** — Chunked keys (C12), newest-first, and a `GET_ACTIVITY` cursor. The panel
  loads 50 events and paginates on scroll.

### G10. Retention cleanup has no scheduled owner. **P1**

FR-009 requires expiry; §11.5 exposes retention settings; nothing says who runs the cleanup.

- **Recommended default** — Run retention cleanup at the end of every sweep but no more than once per
  hour (persist `lastRetentionRunAt`), plus once on startup, plus immediately when retention settings
  change. Emit at most one `AUTOMATIC_MAINTENANCE` event per day summarizing what was trimmed.

### G11. Migration strategy is named (`migrationVersion`) but never defined. **P1**

- **Recommended default** — An ordered array of migrations `{ to: number, run(): Promise<void> }`
  executed inside `onInstalled` before anything else touches storage, guarded by a session-storage lock
  so a concurrent SW start cannot double-run them, each idempotent, with a pre-migration backup copy of
  `settings:v1` and `lockRecords:v1` under `backup:preMigration:<version>` (deleted after two successful
  startups). On migration failure, set `automationPaused = true`, write an `ERROR` event, and show a
  banner. Never destroy user data on a failed migration.

### G12. URL normalization: sorting query parameters can change page semantics. **P2**

§20 requires sorting query parameters and preserving all of them.

- **Why it matters** — For *identity comparison* that is fine, but the normalized URL must never be used
  for navigation or restore (some servers are parameter-order sensitive). The PRD already says not to use
  it for closing/redirecting, but the recovery record should be explicit.
- **Recommended default** — Store both `url` (raw, used for restore/navigation) and `normalizedUrl`
  (identity only). Add a unit test asserting the raw URL is what `RESTORE_RECOVERY` uses. Also decide
  the `#fragment` question explicitly: §20 says preserve fragments, which means
  `page#a` and `page#b` are different tabs for future duplicate detection — probably wrong for most
  sites, but correct for SPAs that route on the hash. Keep as specified for v0.1; revisit in v0.2.

---

## Section H — Other risks and expert observations

### H1. Titles and URLs are attacker-controlled strings; escaping is not the only concern. **P2**

PRV-008 requires escaping (React handles it).

- **Why it matters** — Remaining vectors: bidirectional-override characters (U+202A–U+202E, U+2066–U+2069)
  in a page title can visually spoof a different domain in your list; extremely long titles can break
  layout or bloat storage; a `data:`/`javascript:` URL rendered as an `<a href>` is a (CSP-blocked but
  avoidable) hazard; homograph domains look identical.
- **Recommended default** — Strip bidi control characters and truncate titles to 300 chars **before
  storage**; never render a tab URL as a real anchor (use a button that calls `ACTIVATE_TAB`, and a
  "Copy URL" action); display the hostname via `new URL(url).hostname` with a `punycode`-visible form
  (show the raw `xn--` host in a tooltip). Never `innerHTML`.

### H2. The panel document can outlive a service-worker update, producing version skew. **P1**

- **Recommended default** — Include the extension version in `GET_APP_STATE` responses; if it differs
  from the version the panel booted with, show "Extension updated — reload panel" and offer
  `location.reload()`. Also handle `chrome.runtime.onMessage` failures ("Extension context invalidated")
  by showing that banner rather than throwing.

### H3. Two panels + context menu + keyboard command can issue conflicting mutations concurrently. **P2**

- **Recommended default** — All mutations go through a single serialized async queue in the SW; each
  handler re-reads the current record before mutating (read-modify-write under the queue) rather than
  trusting the payload's view of state.

### H4. `chrome.storage` change events will fire for the extension's own writes; naive UI wiring can loop. **P2**

- **Recommended default** — The panel should not listen to `storage.onChanged` at all; it should render
  from `GET_APP_STATE` + explicit broadcasts. If you do use `storage.onChanged`, debounce to ≥250 ms and
  ignore keys the panel does not render.

### H5. PERF-005/006 forbid polling, but relative timestamps need to update and the panel can be open for days. **P2**

- **Recommended default** — A single `setInterval` **in the panel** (not the SW) at 30 s that only
  recomputes relative-time strings from already-fetched timestamps, plus a lightweight `GET_APP_STATE`
  refresh on `document.visibilitychange` and every 60 s. That satisfies both requirements as written.

### H6. `PRV-005` (no URL logging in production) needs a build-time mechanism, not a convention. **P2**

- **Recommended default** — A `log.ts` wrapper that is a no-op when `import.meta.env.PROD`, plus an
  ESLint rule banning bare `console.*` outside that module, plus the CI grep from D8.

### H7. The success metric "percentage of automatic closures later restored" is not computable from the specified schema. **P2**

- **Recommended default** — Add `restoredAt` to `RecoveryRecord` (G4) and compute locally. Surface it in
  Settings as a self-tuning hint: "You restored 40% of automatically closed tabs. Consider increasing
  the close threshold." That is a genuinely differentiating, privacy-preserving feature and it directly
  serves §6.2's stated purpose.

### H8. Nothing defines what the extension does when `chrome.storage` is full or failing. **P1**

- **Recommended default** — On any `STORAGE_WRITE_FAILED` during a sweep: abort the sweep, set
  `automationPaused = true`, show a persistent panel banner with a "Clear old history" action. Failing
  closed (no automation) is always the correct direction for this product.

### H9. Is the "IDLE" name right, given the UI says "sleeping" and Chrome says "discarded"? **P2**

§9.1 uses `IDLE`; §11.2 filters say "Idle"; §4.5/§3.2 say "Sleeping"; Chrome says "discarded".

- **Recommended default** — Keep `IDLE` as the internal enum (avoid churn) but use **"Sleeping"**
  consistently in all user-facing strings, and say "(unloaded from memory by Chrome)" in the tooltip.
  One term per audience.

### H10. The PRD never states how a user discovers that a tab in the tab strip is asleep. **P2**

- **Recommended default** — Nothing to do: Chrome renders discarded tabs with a faded/dimmed appearance
  natively. Mention it in onboarding so users are not surprised by reloads. Do not attempt to modify the
  tab strip (impossible without host permissions and title rewriting, which is user-hostile).

### H11. The roadmap's v0.7 "copy-event signals" and "active reading duration" require content scripts and host permissions — a hard break with the current privacy posture and permission set. **P2**

- **Recommended default** — Treat v0.7 as a separate product decision requiring a new listing disclosure,
  a forced permission re-consent (D11), and an updated privacy policy. Note it in the roadmap so it is
  not stumbled into. Also note: under the August 2026 Limited Use rule, collecting reading-duration data
  must be strictly necessary to the disclosed single purpose — arguable, and worth pre-clearing before
  building.

### H12. There is no statement of what the extension does *not* protect against, in user-facing terms. **P1**

- **Recommended default** — Ship a `KNOWN_LIMITATIONS.md` (§34 requires "known limitations documented")
  and mirror the top five into onboarding and the store description: sleeping can lose unsaved form
  text; automatic closing does not ask the page to confirm; recovery restores the URL, not the page
  state; locks are best-effort across browser restarts; incognito is not managed. Being explicit here is
  the highest-leverage trust action available, and it costs nothing.

---

## Section I — Recommended defaults, consolidated

If you answer nothing, `IMPLEMENTATION_PLAN.md` assumes exactly this.

| # | Decision | Default assumed |
| --- | --- | --- |
| 1 | Automation on first install | Off until onboarding is completed; hard-gated on `onboardingCompleted` |
| 2 | First 7 days after onboarding | **Report-only** for closing (sleeping active) |
| 3 | `minimum_chrome_version` | **121** |
| 4 | Permissions | `tabs`, `storage`, `alarms`, `sidePanel`, `contextMenus`, **`favicon`**; `incognito: not_allowed` |
| 5 | Favicons | Chrome favicon cache via `_favicon/`, never remote URLs |
| 6 | Volatile tab state | `chrome.storage.session`; durable data in `storage.local`, chunked, byte-budgeted |
| 7 | Activity across restarts | URL-keyed `activityLedger` seeds `lastActivatedAt`; LRU-capped at 2000 |
| 8 | Browser downtime | Not counted as inactivity; 30-minute settling period after startup/update/resume |
| 9 | Blast radius | ≤10 closures/sweep, ≤25/hour, ≤50 discards/sweep, chunked in 10s |
| 10 | Extension update mid-grace | All pending closures cancelled, logged, settling period applied |
| 11 | Never-activated tabs | `max(closeAfter, 14 days)`; never close within 24h of first observation |
| 12 | Lock semantics | Binds to tab instance, follows navigation, warns on origin change |
| 13 | New control | **"Keep loaded"** (no auto-sleep + `autoDiscardable: false`) |
| 14 | New control | **Snooze** ("keep 7 more days") |
| 15 | New control | **Per-host skip lists** (`neverSleepHosts`, `neverCloseHosts`), seeded with mail/chat/meeting hosts |
| 16 | Default `sleepAfterMinutes` | **120** (not 60) |
| 17 | Non-normal windows | Displayed as `UNAVAILABLE`, never automated |
| 18 | New tab pages / `about:blank` | Closeable after ≤24h with no recovery record; everything else privileged stays unavailable |
| 19 | `file://` tabs | Discardable, never auto-closed |
| 20 | Tab groups | `groupId` tracked; never auto-close the last tab of a named group |
| 21 | Notification of closures | Action badge (pending count + recent-closure count); no OS notifications |
| 22 | Side panel opening | `setPanelBehavior({ openPanelOnActionClick: true })`; onboarding opens in a normal tab |
| 23 | Keyboard shortcuts | `_execute_action` = `Alt+Shift+T`; `toggle-tab-lock` ships with **no** suggested key |
| 24 | Theme | Light + dark from day one |
| 25 | Diagnostics | Local, opt-in, hostname-redacted, copy-to-clipboard; zero network |
| 26 | Distribution | CWS: Draft early → trusted testers → unlisted → public at 10/50/100% |
| 27 | Trader status | Non-trader |
| 28 | License | MIT, public GitHub repo, Issues as the support channel |
| 29 | `operateAcrossAllWindows` | Cut from v0.1 |
| 30 | `sessions` permission | Not in v1.0; decision recorded before v1.0 freeze |

---

## Section J — Empirical verification checklist (do these in a real Chrome before trusting the design)

Each item is a 5–20 minute experiment. Record results in `docs/API_VERIFICATION.md`; several design
decisions above are conditional on them.

1. **J1 — discard on a muted-but-active video call.** Join a Meet/Zoom-in-browser call, mute, background
   the tab, call `discard()`. Does Chrome refuse? Does the call drop? (Determines whether the host skip
   list is a nice-to-have or a hard requirement.)
2. **J2 — discard with unsaved form input.** Type into a textarea, background, `discard()`, reactivate.
   Is the text restored by Chrome's session state or lost? (Determines onboarding copy and default
   `sleepAfterMinutes`.)
3. **J3 — discard return value.** `discard()` an active tab, an already-discarded tab, a `chrome://`
   tab, a loading tab, a PDF tab, a `file://` tab. Record whether it rejects, resolves with `undefined`,
   or resolves with a `Tab`.
4. **J4 — does the tab ID survive a discard?** Log `tabId` before/after and watch for `onReplaced`.
   (If IDs change, every id-keyed structure needs the `onReplaced` transfer path to be airtight.)
5. **J5 — `lastAccessed` after session restore.** Open 5 tabs, note times, quit Chrome, wait, reopen with
   session restore, inspect `lastAccessed`. Is it the pre-restart time or the restore time? (Determines
   whether the URL ledger is essential — expect: yes.)
6. **J6 — `tabs.remove` and `beforeunload`.** Put a `beforeunload` handler on a page, background it,
   `tabs.remove()` it. Any dialog? Any veto?
7. **J7 — `tabs.reload` on a discarded tab.** Does it load in the background without activating?
8. **J8 — side panel behavior.** With `openPanelOnActionClick: true`, does a second action click close
   the panel? Does `action.onClicked` fire at all? Does the panel persist across tab switches and
   window focus changes? How many panel documents exist with 3 windows open?
9. **J9 — permission warning diff.** Use `chrome.management.getPermissionWarningsByManifest` on your v1.0
   manifest vs. the same manifest plus `favicon`, plus `sessions`, plus `notifications`. Record which
   additions are "free." (Directly determines D11.)
10. **J10 — alarm behavior across suspend.** Set a 5-minute alarm, suspend the laptop for an hour, resume.
    How many `onAlarm` events fire, and with what delay?
11. **J11 — storage quota behavior.** Deliberately write >10 MB to `storage.local`. Confirm the rejection
    shape and that the trim-and-retry helper recovers.
12. **J12 — 1500-tab profile.** Generate 1500 tabs; measure `chrome.tabs.query` latency, panel first
    render, search latency, sweep duration, and `getBytesInUse`.
13. **J13 — unpacked reload semantics.** Reload an unpacked extension; record whether `onInstalled` fires
    and with which `reason`, whether alarms survive, and whether `storage.session` is cleared.
14. **J14 — context menu availability.** Right-click on a normal page, a PDF, a `chrome://` page, the
    NTP, and the toolbar icon. Where does the item appear, and is `tab` populated in `onClicked`?
15. **J15 — production build audit.** Build the zip; grep for `eval(`, `new Function(`, remote URLs, and
    sourcemap references; load the zip as unpacked and confirm zero CSP violations in the console.
