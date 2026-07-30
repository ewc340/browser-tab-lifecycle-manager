# Product Requirements Document: Tab Lifecycle Manager

**Working title:** Tab Lifecycle Manager  
**Product type:** Chrome desktop extension  
**Document status:** Ready for implementation  
**Initial distribution:** Locally loaded unpacked extension  
**Target architecture:** Chrome Manifest V3  
**Primary objective:** Automatically reduce tab clutter and memory consumption without unexpectedly losing valuable tabs.

---

## 1. Executive Summary

Tab Lifecycle Manager is a Chrome extension that automatically manages open browser tabs based on inactivity and explicit user protection.

The first usable version must allow a user to:

1. View all open tabs in a persistent side-panel control center.
2. See whether each tab is active, backgrounded, sleeping, locked, or pending closure.
3. Lock a tab so the extension cannot automatically remove it.
4. Manually put a background tab to sleep.
5. Automatically put inactive tabs to sleep after a configurable duration.
6. Automatically close inactive, unlocked tabs after a configurable duration.
7. Review every automated action in an internal activity feed.
8. Recover tabs that the extension closed.
9. Understand why any automated action occurred.

Chrome represents a sleeping tab as a **discarded tab**: its page content is unloaded from memory, the tab remains visible, and the page reloads when the user activates it. The extension will use `chrome.tabs.discard()` for this behavior.

The initial version will intentionally exclude semantic classification, automated research detection, auto-bookmarking, domain locks, tab-group locks, and intelligent duplicate detection. The architecture must leave clear extension points for these features.

---

## 2. Problem Statement

Users often leave tabs open for several conflicting reasons:

- They are actively using the tab.
- They expect to return to it shortly.
- It is part of an ongoing research task.
- It contains information they may need in the future.
- They are afraid they will forget the page if they close it.
- They simply forgot the tab was open.

These tabs accumulate, consume memory, become difficult to navigate, and make it harder to distinguish current work from abandoned browsing.

A simple timer that closes every old tab is unsafe. It cannot distinguish a disposable search result from a valuable reference page.

The product therefore needs two separate concepts:

- **Lifecycle:** Whether a tab is active, in the background, sleeping, pending closure, or closed.
- **Retention protection:** Whether the extension is allowed to remove that tab.

The product should first solve lifecycle management safely. More sophisticated classification and knowledge-preservation features can be layered on afterward.

---

## 3. Product Principles

### 3.1 Preserve user trust

A user should never wonder why a tab disappeared.

Every automatic action must:

- Have a recorded reason.
- Appear in the activity feed.
- Be reversible when technically possible.
- Respect tab protection.
- Follow an explicit configured rule.

### 3.2 Sleep before closing

The normal lifecycle should be:

```text
Active
  ↓
Background
  ↓
Sleeping
  ↓
Pending closure
  ↓
Closed but recoverable
```

Sleeping saves memory without removing the tab. Closing is the final lifecycle action and must use a more conservative threshold.

### 3.3 Protection and memory management are separate

For the initial version:

- A **locked tab** cannot be automatically closed.
- A locked tab may still be put to sleep to release memory.
- The user can still manually close a locked tab through Chrome.
- Locking does not create a strict browser-level close lock.

A future `Keep awake` control may separately prevent sleeping.

### 3.4 Prefer deterministic rules over premature AI

The MVP should use transparent inputs:

- Time since last activation.
- Whether the tab is currently active.
- Whether it is pinned.
- Whether it is audible.
- Whether it is already sleeping.
- Whether it is locked.
- Whether its URL is eligible for management.

No AI model or network service is required for the first release.

### 3.5 Local-first operation

The MVP must:

- Send no browsing data to external services.
- Require no account.
- Require no backend.
- Store configuration and activity locally.
- Avoid reading webpage content.

---

## 4. Summary of Features Discussed

### 4.1 Timed automatic closure

**Description:** Close tabs after they have remained inactive for a configured duration.

**Why it matters:** This is the original core use case. Forgotten tabs should not remain open indefinitely.

**MVP status:** Included.

### 4.2 Activity-aware timing

**Description:** Measure inactivity from the last time the user activated the tab instead of only measuring how long ago the tab was created.

**Why it matters:** A seven-day-old tab used five minutes ago is more relevant than a two-hour-old tab that was never revisited.

**MVP status:** Included.

### 4.3 Cleanup locking

**Description:** Mark an individual tab as protected from automatic closure.

**Why it matters:** Some tabs belong to active work, research, or future reference and must not be removed merely because they are old.

**MVP status:** Included.

**Future extensions:**

- Temporary locks.
- Domain-wide locks.
- Tab-group locks.
- Session locks.
- Strict restore-on-manual-close locks.

### 4.4 Tab control center

**Description:** A side-panel interface showing all tabs and their states.

**Why it matters:** Native Chrome tabs become difficult to inspect when many are open. A searchable and filterable control center makes lifecycle state visible and manageable.

**MVP status:** Included.

### 4.5 Manual and automatic sleeping

**Description:** Unload background tabs from memory while retaining them in the tab strip.

**Why it matters:** Some tabs should remain available without continuing to consume the resources required by a loaded webpage.

**MVP status:** Included.

### 4.6 Duplicate-tab reuse

**Description:** When the user opens a URL that is already open, focus and wake the existing tab rather than retaining a duplicate.

**Why it matters:** It prevents tab accumulation and preserves the state of an existing page.

**Planned stages:**

1. Exact URL matching.
2. Normalized URL matching.
3. Tracking-parameter removal.
4. Domain-specific resource identity.
5. Semantic similarity.

**MVP status:** Excluded from version 0.1. Planned immediately after lifecycle stability.

### 4.7 Archive and save-for-later behavior

**Description:** Preserve potentially useful pages outside the tab strip instead of permanently deleting them.

**Why it matters:** Users often leave tabs open because they fear losing the information, not because the page needs to remain open.

Potential saved metadata includes:

- URL.
- Title.
- Favicon.
- Date saved.
- Last viewed time.
- Research collection.
- User note.
- Reason preserved.

**MVP status:** A limited recovery history is included. Full archive functionality is deferred.

### 4.8 Research sessions and collections

**Description:** Group related pages into a named research collection that can be slept, archived, restored, or protected together.

**Why it matters:** Research tabs represent one task and should be managed as a collection rather than as unrelated individual pages.

**MVP status:** Excluded.

### 4.9 Selective auto-bookmarking

**Description:** Promote high-value saved pages into Chrome bookmarks.

**Why it matters:** Some pages are durable references rather than temporary research material.

**Product decision:** Do not automatically bookmark pages in early releases. Uncontrolled bookmarking would move clutter from the tab strip into the bookmarks tree. Begin with manual promotion from a future archive.

**MVP status:** Excluded.

### 4.10 Internal notifications and activity history

**Description:** Record tab lifecycle actions and selectively surface meaningful notifications.

**Why it matters:** Automation needs visibility, explanation, and reversibility.

Potential events include:

- Tab slept.
- Tab awakened.
- Tab locked.
- Tab unlocked.
- Tab scheduled for closure.
- Tab closed.
- Tab restored.
- Duplicate avoided.
- Rule skipped.
- Automation error.

**MVP status:** Activity feed and in-panel toasts included. Operating-system notifications are deferred.

---

## 5. MVP Product Decisions

The following decisions are binding for version 0.1.

### 5.1 Lock semantics

A locked tab:

- Cannot be automatically closed by this extension.
- Cannot enter the pending-closure state.
- Can still be automatically or manually put to sleep.
- Can still be manually closed through Chrome.
- Is shown with a persistent filled lock icon in the side panel.

An unlocked row reveals a lock control on hover or keyboard focus.

### 5.2 Pinned tab semantics

Pinned tabs are excluded from:

- Automatic sleeping.
- Automatic closure.

The user may manually sleep a pinned tab only after confirming the action.

### 5.3 Audible tab semantics

Audible tabs are excluded from:

- Automatic sleeping.
- Automatic closure.

### 5.4 Active tab semantics

The active tab in each window is excluded from:

- Sleeping.
- Pending closure.
- Automatic closure.

### 5.5 Incognito behavior

The extension does not operate in incognito mode during version 0.1.

### 5.6 Internal Chrome pages

The extension must not manage unsupported or privileged pages, including URLs beginning with:

```text
chrome://
chrome-extension://
devtools://
view-source:
```

These tabs can appear in the control center but must be labeled `Unavailable` and have lifecycle actions disabled.

### 5.7 Closing behavior

Tabs are not closed immediately upon crossing the configured threshold.

The extension first assigns:

```text
pendingCloseAt = current time + configured grace period
```

During the grace period, any of the following cancels closure:

- The user activates the tab.
- The user locks the tab.
- The tab becomes pinned.
- The tab becomes audible.
- The user changes or disables the automatic-close rule.

### 5.8 Recovery behavior

Before automatically closing a tab, store a recovery snapshot.

A recovery snapshot is retained for 30 days by default and allows the user to reopen the URL. Recovery does not guarantee restoration of:

- Unsaved form data.
- Page JavaScript state.
- Authentication state beyond what the website itself retains.
- Scroll position.
- Back-forward navigation history.

---

## 6. Goals

### 6.1 Version 0.1 goals

The version is successful when a user can:

- Install the extension locally.
- Open the side panel.
- See all tabs across all normal Chrome windows.
- Lock and unlock tabs.
- Sleep eligible tabs manually.
- Configure inactivity thresholds.
- Observe tabs automatically sleeping.
- Observe eligible tabs automatically entering pending closure.
- Recover a tab after the extension closes it.
- Review a reason for each automatic action.
- Use the extension for normal daily browsing without unexpected removal of protected, active, pinned, or audible tabs.

### 6.2 Success metrics for dogfooding

Track locally:

- Number of manual sleep actions.
- Number of automatic sleep actions.
- Number of automatic closures.
- Number of restored closed tabs.
- Number of locked tabs.
- Number of pending closures canceled by user activity.
- Number of automation failures.
- Percentage of automatic closures later restored.

A high restore rate indicates that automatic closure is too aggressive.

No metrics leave the device.

---

## 7. Non-Goals for Version 0.1

Do not implement the following in the first release:

- AI or machine-learning classification.
- Reading webpage body content.
- Automatic topic detection.
- Research-session detection.
- Full archive collections.
- Automatic bookmarks.
- Exact or semantic duplicate reuse.
- Domain locks.
- Group locks.
- Temporary locks.
- Strict manual-close prevention.
- Cloud synchronization.
- User accounts.
- Mobile Chrome support.
- Firefox or Safari support.
- Exact memory-savings calculations.
- System-level notifications.
- Per-domain expiration rules.
- Unsaved-form detection.
- Cross-device tab management.

These features must not delay the usable lifecycle-management release.

---

## 8. User Stories

### US-001: Inspect tab state

As a user with many tabs, I want to see all open tabs and their lifecycle state so that I can understand what is consuming attention and memory.

### US-002: Protect an important tab

As a user doing research, I want to lock a tab so that automatic cleanup cannot close it.

### US-003: Save memory without losing a tab

As a user, I want to put an inactive tab to sleep so that it remains available without keeping its page loaded.

### US-004: Automatically sleep forgotten tabs

As a user, I want inactive tabs to sleep automatically after a configurable duration.

### US-005: Automatically remove abandoned tabs

As a user, I want sufficiently old and inactive tabs to be closed automatically, provided they are not important or unsafe to close.

### US-006: Understand automation

As a user, I want to know what happened to a tab and why.

### US-007: Reverse a mistake

As a user, I want to restore a tab that the extension automatically closed.

### US-008: Apply bulk actions

As a user with many tabs, I want to select several tabs and sleep, lock, unlock, or close them together.

---

## 9. Terminology and State Model

### 9.1 Derived lifecycle states

A tab must have exactly one displayed lifecycle state.

#### `ACTIVE`

The tab is active in its window.

#### `BACKGROUND`

The tab is loaded but is not active.

#### `IDLE`

The tab has `discarded === true`.

#### `PENDING_CLOSE`

The tab passed the close threshold and has a future `pendingCloseAt`.

#### `UNAVAILABLE`

The extension cannot safely manage the tab because of its URL, window type, or missing data.

`LOCKED` is not a lifecycle state. It is an independent retention property.

A valid combination is therefore:

```text
IDLE + LOCKED
```

This means the tab is unloaded from memory but cannot be automatically removed.

### 9.2 Lifecycle-state precedence

When displaying state, use this precedence:

```text
UNAVAILABLE
PENDING_CLOSE
ACTIVE
IDLE
BACKGROUND
```

### 9.3 Eligibility definitions

#### Eligible for automatic sleeping

A tab is eligible only when all are true:

```text
tab is not active
tab is not discarded
tab is not pinned
tab is not audible
tab is in a normal browser window
tab URL is manageable
inactivity >= sleepAfterMinutes
```

Lock status does not affect sleeping.

#### Eligible for automatic closure

A tab is eligible only when all are true:

```text
tab is not active
tab is not pinned
tab is not audible
tab is not locked
tab is in a normal browser window
tab URL is manageable
inactivity >= closeAfterMinutes
```

A tab does not have to be sleeping before entering pending closure, but automatic evaluation should attempt to sleep it first if possible.

---

## 10. Default Settings

Use conservative defaults.

```ts
const DEFAULT_SETTINGS = {
  sleepEnabled: true,
  sleepAfterMinutes: 60,

  autoCloseEnabled: true,
  closeAfterMinutes: 7 * 24 * 60,
  closeGraceMinutes: 10,

  skipPinnedTabs: true,
  skipAudibleTabs: true,
  operateAcrossAllWindows: true,

  activityRetentionDays: 30,
  recoveryRetentionDays: 30,
  maximumActivityEvents: 1000,

  showInPanelToasts: true
};
```

The onboarding screen must clearly state:

```text
Inactive tabs will sleep after 1 hour.
Unlocked tabs may close after 7 days of inactivity.
You can change these settings at any time.
```

The user must click `Enable automatic management` before automatic sleeping and closing begin.

Until that confirmation:

```text
sleepEnabled = false
autoCloseEnabled = false
```

Manual actions remain available.

---

## 11. User Interface Requirements

### 11.1 Primary surface: side panel

The side panel is the main application interface.

Recommended navigation:

```text
Tabs | Activity | Recovery | Settings
```

The toolbar extension icon opens or closes the side panel.

### 11.2 Tabs view

#### Header

Display:

```text
Tab Lifecycle Manager

42 tabs
Active 3 · Background 18 · Idle 17 · Locked 4
```

Include:

- Search field.
- Window filter.
- State filter.
- Sort selector.
- Bulk selection toggle.

#### Search behavior

Search case-insensitively across:

- Page title.
- Hostname.
- Full URL.

Search must happen locally.

#### Filter options

```text
All
Active
Background
Idle
Locked
Pending closure
Unavailable
```

#### Sort options

```text
Recently active
Least recently active
Title
Domain
Window
Pending closure time
```

#### Tab row

Each row must display:

- Favicon when available.
- Title.
- Domain.
- Lifecycle state.
- Time since last activation.
- Lock state.
- Overflow menu.

Example:

```text
[icon] Chrome Tabs API
       developer.chrome.com · idle 3h
                              [Wake] [🔒] [⋮]
```

#### Row interactions

Clicking the row:

1. Focuses the tab’s window.
2. Activates the tab.
3. Causes a discarded tab to reload naturally.

Hovering or keyboard-focusing an unlocked row reveals an outline lock icon.

A locked row always displays a filled lock icon.

#### Overflow-menu actions

```text
Go to tab
Sleep now
Lock from automatic closure
Close tab
Copy URL
```

For a locked tab:

```text
Go to tab
Sleep now
Unlock
Close tab manually
Copy URL
```

#### Bulk actions

When one or more tabs are selected:

```text
Sleep
Lock
Unlock
Close
Clear selection
```

Bulk closing must require confirmation when more than five tabs are selected.

### 11.3 Activity view

The activity feed displays newest events first.

Example:

```text
9:04 AM
Put 4 tabs to sleep
Reason: Inactive for at least 1 hour
[View tabs]

8:42 AM
Closed “Reddit discussion”
Reason: Inactive for 7 days
[Restore] [Lock restored tab]

8:31 AM
Locked “Chrome Tabs API”
Source: Manual action
[Unlock]
```

#### Activity filters

```text
All
Automatic
Manual
Sleep
Close
Protection
Warnings
Errors
```

#### Aggregation

Events of the same type occurring in the same automation sweep should be grouped.

Do not create five separate feed entries when five tabs are slept together.

Instead create one parent event with child snapshots.

### 11.4 Recovery view

Display extension-closed tabs from the previous 30 days.

Each item includes:

- Title.
- URL or hostname.
- Closure time.
- Reason.
- Original window ID when available.
- Original position.
- Restore button.
- Remove-from-history button.

Actions:

```text
Restore
Restore and lock
Delete recovery record
Clear all recovery records
```

Restoring creates a new tab. It does not guarantee restoration of the page’s prior runtime state.

### 11.5 Settings view

#### Automatic sleeping

```text
[Toggle] Automatically sleep inactive tabs
Sleep after: [duration selector]
```

Suggested durations:

```text
15 minutes
30 minutes
1 hour
2 hours
4 hours
8 hours
24 hours
Custom
```

#### Automatic closure

```text
[Toggle] Automatically close inactive tabs
Close after: [duration selector]
Grace period: [duration selector]
```

Suggested close durations:

```text
6 hours
12 hours
1 day
3 days
7 days
14 days
30 days
Custom
```

#### Safety

Display as enabled, non-editable MVP guarantees:

```text
Always skip active tabs
Always skip pinned tabs
Always skip audible tabs
Always skip locked tabs when closing
```

#### History

```text
Activity retention: 30 days
Recovery retention: 30 days
Clear activity
Clear recovery
```

#### Automation control

Provide a prominent global toggle:

```text
Pause all automation
```

When paused:

- No automatic sleeping occurs.
- No pending closures are created.
- Existing pending closures are canceled.
- Manual actions continue to work.

### 11.6 In-panel toast notifications

When the side panel is open, display temporary notifications for direct actions.

Examples:

```text
Tab locked
“Chrome Tabs API” is protected from automatic closure.
[Undo]
```

```text
4 tabs put to sleep.
[Undo where possible]
```

Do not show one toast for each tab in a bulk action.

---

## 12. Functional Requirements

### FR-001: Enumerate open tabs

The extension must query all tabs in all normal Chrome windows and display them in the side panel.

#### Acceptance criteria

- Every normal-window tab appears.
- Incognito tabs do not appear unless support is deliberately enabled in a future release.
- Window identity is retained.
- The active tab in each window is correctly identified.
- Closing or creating a tab updates the list without requiring a panel refresh.

### FR-002: Track tab activity

The extension must track the most recent time each tab was activated.

Use `chrome.tabs.onActivated` as the primary source of activity.

On initial discovery:

1. Use `tab.lastAccessed` when available.
2. Otherwise use the current time for active tabs.
3. Otherwise initialize from the time the extension first observed the tab.

#### Acceptance criteria

- Activating a tab updates `lastActivatedAt`.
- Activating a pending-close tab cancels its pending closure.
- Inactivity values update in the UI at least once per minute.
- Service-worker restarts do not erase stored activity timestamps.

### FR-003: Lock and unlock a tab

The user must be able to toggle `closeLocked` through:

- The side-panel tab row.
- The tab-row overflow menu.
- A page context-menu command.
- A keyboard shortcut.

Suggested command:

```text
Ctrl+Shift+L
macOS: Command+Shift+L
```

#### Acceptance criteria

- Locking immediately cancels pending closure.
- Locked tabs never enter pending closure.
- Locked tabs are never closed by the automation engine.
- Locked tabs can still be slept.
- The UI updates without a full reload.
- An activity event is recorded.
- The context-menu label reflects the current tab state when practical.

### FR-004: Manually sleep a tab

The user must be able to call `chrome.tabs.discard(tabId)` for an eligible background tab.

#### Acceptance criteria

- The active tab cannot be manually slept.
- An already-discarded tab does not generate an error.
- The UI changes to `IDLE` after a successful discard.
- A successful action creates an activity event.
- A failed action creates an error event with a human-readable message.

### FR-005: Automatically sleep inactive tabs

A periodic lifecycle sweep evaluates all open tabs.

Recommended sweep interval:

```text
5 minutes
```

#### Acceptance criteria

- Eligible tabs exceeding `sleepAfterMinutes` are discarded.
- Active, pinned, audible, unavailable, or already-discarded tabs are skipped.
- Locked tabs remain eligible for sleeping.
- All sleep actions from one sweep are aggregated into one activity event.
- The action reason records the applicable inactivity threshold.
- Disabling automatic sleep prevents future sleep actions.

### FR-006: Schedule inactive tabs for closure

When an eligible tab passes `closeAfterMinutes`, set `pendingCloseAt`.

#### Acceptance criteria

- The tab immediately displays `PENDING_CLOSE`.
- The activity feed records the scheduled action.
- Locking or activating the tab cancels pending closure.
- Pausing automation cancels all pending closures.
- Changing the close threshold causes all pending closures to be reevaluated.
- No tab is closed in the same evaluation during which it first enters pending closure.

### FR-007: Automatically close pending tabs

During a lifecycle sweep, close a pending tab only when:

```text
current time >= pendingCloseAt
and tab is still eligible
```

Before closure:

1. Store a recovery snapshot.
2. Store an activity event.
3. Mark the action as initiated by the extension.
4. Call `chrome.tabs.remove(tabId)`.

#### Acceptance criteria

- The recovery snapshot exists before removal.
- Locked, active, pinned, or audible tabs are not closed.
- A tab that disappeared before removal does not cause the sweep to fail.
- One tab failure does not stop processing of other eligible tabs.
- Automatic closures are distinguishable from user closures.
- The activity event includes the configured rule and inactivity duration.

### FR-008: Recover an extension-closed tab

The user must be able to restore a recovery snapshot.

#### Acceptance criteria

- Restoration creates a tab with the stored URL.
- The extension attempts to restore it to its original window when that window still exists.
- Otherwise it restores to the current normal window.
- The extension attempts to use the original tab index.
- `Restore and lock` creates the tab and immediately assigns protection.
- The recovery record remains unless the user removes it or retention expires.
- The restored action is recorded.

### FR-009: Maintain an activity feed

The extension must store lifecycle events locally.

#### Acceptance criteria

- Events survive service-worker suspension and browser restart.
- Events are sorted newest first.
- Old events expire according to the configured retention period.
- The maximum count prevents unbounded storage growth.
- Events can be filtered by type.
- Routine grouped actions appear as one aggregate event.

### FR-010: Persist settings

Settings must survive browser restarts and extension-service-worker termination.

Use `chrome.storage.local` for MVP data.

#### Acceptance criteria

- Settings changes apply immediately.
- Default settings are created on first installation.
- Missing fields are filled during schema migration.
- Corrupted settings fall back safely to defaults.
- No storage write is performed once per second solely to update displayed relative times.

### FR-011: Reconcile state after startup

Manifest V3 service workers are not persistent background pages and can terminate while dormant. State must therefore be persisted rather than relying on global variables.

On service-worker startup:

1. Ensure the lifecycle alarm exists.
2. Query all open tabs.
3. Reconcile stored records with current tabs.
4. Remove stale tab records.
5. Add missing tab records.
6. Rebind locks when possible.
7. Cancel invalid pending closures.
8. Run one lifecycle evaluation.

#### Acceptance criteria

- Reloading the unpacked extension does not crash.
- Browser sleep does not cause multiple duplicated actions.
- Missing alarms are recreated.
- Overdue tabs are evaluated once after startup.
- Repeated startup reconciliation is idempotent.

### FR-012: Provide global pause

The user must be able to pause all automatic management.

#### Acceptance criteria

- Pausing cancels pending closures.
- Manual sleep, lock, unlock, close, and restore remain available.
- The side-panel header visibly indicates that automation is paused.
- Resuming triggers a fresh lifecycle evaluation but does not immediately bypass the close grace period.

---

## 13. Lock Persistence

Chrome tab IDs are scoped to a browser session and should not be treated as permanent identifiers.

Store lock records as:

```ts
interface TabLockRecord {
  lockId: string;
  currentTabId: number;
  url: string;
  normalizedUrl: string;
  windowId: number;
  index: number;
  title: string;
  lockedAt: number;
}
```

### Startup rebinding algorithm

For each lock record:

1. Check whether `currentTabId` still references a tab with the same URL.
2. If so, keep the binding.
3. Otherwise find unlocked candidate tabs with the same normalized URL.
4. Prefer:
   - Same window.
   - Closest original index.
   - Closest title.
5. If exactly one strong candidate exists, rebind the lock.
6. If multiple candidates are equally plausible:
   - Do not guess.
   - Record a warning.
   - Display `Lock could not be restored after restart`.

This is a best-effort MVP mechanism.

A later version may introduce URL-pattern locks or tab-group locks, which naturally persist more reliably than instance-level tab locks.

---

## 14. Data Model

Use versioned schemas.

```ts
type LifecycleDisplayState =
  | "ACTIVE"
  | "BACKGROUND"
  | "IDLE"
  | "PENDING_CLOSE"
  | "UNAVAILABLE";

interface ManagedTabRecord {
  schemaVersion: 1;

  tabId: number;
  windowId: number;
  index: number;

  url: string;
  normalizedUrl: string;
  title: string;
  favIconUrl?: string;

  createdAt: number;
  firstObservedAt: number;
  lastActivatedAt: number;
  lastUpdatedAt: number;

  active: boolean;
  pinned: boolean;
  audible: boolean;
  discarded: boolean;
  incognito: boolean;

  manageable: boolean;
  unavailableReason?: string;

  closeLocked: boolean;
  lockId?: string;

  pendingCloseAt?: number;
  pendingCloseReason?: string;
}
```

```ts
interface ExtensionSettings {
  schemaVersion: 1;

  onboardingCompleted: boolean;
  automationPaused: boolean;

  sleepEnabled: boolean;
  sleepAfterMinutes: number;

  autoCloseEnabled: boolean;
  closeAfterMinutes: number;
  closeGraceMinutes: number;

  skipPinnedTabs: true;
  skipAudibleTabs: true;

  operateAcrossAllWindows: boolean;

  activityRetentionDays: number;
  recoveryRetentionDays: number;
  maximumActivityEvents: number;

  showInPanelToasts: boolean;
}
```

```ts
type ActivityEventType =
  | "TAB_LOCKED"
  | "TAB_UNLOCKED"
  | "TAB_SLEPT"
  | "TABS_SLEPT"
  | "TAB_WAKE_OBSERVED"
  | "TAB_CLOSE_SCHEDULED"
  | "TAB_CLOSE_CANCELED"
  | "TAB_CLOSED"
  | "TAB_RESTORED"
  | "AUTOMATION_PAUSED"
  | "AUTOMATION_RESUMED"
  | "RULE_SKIPPED"
  | "WARNING"
  | "ERROR";

interface TabSnapshot {
  tabId?: number;
  windowId?: number;
  index?: number;
  title: string;
  url: string;
  favIconUrl?: string;
}
```

```ts
interface ActivityEvent {
  schemaVersion: 1;

  id: string;
  type: ActivityEventType;
  occurredAt: number;

  source:
    | "MANUAL"
    | "AUTOMATIC_SLEEP"
    | "AUTOMATIC_CLOSE"
    | "SYSTEM";

  message: string;
  reason?: string;

  tabs: TabSnapshot[];

  reversible: boolean;
  relatedRecoveryIds?: string[];

  metadata?: Record<string, string | number | boolean>;
}
```

```ts
interface RecoveryRecord {
  schemaVersion: 1;

  id: string;
  closedAt: number;
  expiresAt: number;

  title: string;
  url: string;
  favIconUrl?: string;

  originalWindowId?: number;
  originalIndex?: number;

  lastActivatedAt?: number;
  closeReason: string;
  closeRuleMinutes: number;
}
```

---

## 15. Storage Layout

Use separate keys to avoid rewriting all data for small changes.

```text
settings:v1
tabRecords:v1
lockRecords:v1
activityEvents:v1
recoveryRecords:v1
migrationVersion
```

For MVP simplicity, arrays are acceptable for activity and recovery data because their sizes are bounded.

Do not store:

- Page body content.
- Form contents.
- Cookies.
- Authentication tokens.
- Screenshots.
- Search-query classification.
- Page text.

---

## 16. Lifecycle Evaluation Algorithm

Implement one pure evaluation function where possible.

```ts
interface EvaluationResult {
  action:
    | "NONE"
    | "SLEEP"
    | "SCHEDULE_CLOSE"
    | "CANCEL_CLOSE"
    | "CLOSE";

  reason: string;
  pendingCloseAt?: number;
}
```

Pseudocode:

```ts
function evaluateTab(
  tab: ManagedTabRecord,
  settings: ExtensionSettings,
  now: number
): EvaluationResult {
  if (settings.automationPaused) {
    return tab.pendingCloseAt
      ? { action: "CANCEL_CLOSE", reason: "Automation paused" }
      : { action: "NONE", reason: "Automation paused" };
  }

  if (!tab.manageable || tab.incognito) {
    return cancelPendingOrNone(tab, "Tab is unavailable");
  }

  if (tab.active) {
    return cancelPendingOrNone(tab, "Tab is active");
  }

  if (tab.pinned) {
    return cancelPendingOrNone(tab, "Tab is pinned");
  }

  if (tab.audible) {
    return cancelPendingOrNone(tab, "Tab is audible");
  }

  const inactiveMinutes = (now - tab.lastActivatedAt) / 60_000;

  if (tab.closeLocked) {
    if (tab.pendingCloseAt) {
      return {
        action: "CANCEL_CLOSE",
        reason: "Tab is protected from automatic closure"
      };
    }

    if (
      settings.sleepEnabled &&
      !tab.discarded &&
      inactiveMinutes >= settings.sleepAfterMinutes
    ) {
      return {
        action: "SLEEP",
        reason: `Inactive for ${Math.floor(inactiveMinutes)} minutes`
      };
    }

    return {
      action: "NONE",
      reason: "Tab is protected from automatic closure"
    };
  }

  if (
    settings.autoCloseEnabled &&
    inactiveMinutes >= settings.closeAfterMinutes
  ) {
    if (!tab.pendingCloseAt) {
      return {
        action: "SCHEDULE_CLOSE",
        reason: `Inactive for ${Math.floor(inactiveMinutes)} minutes`,
        pendingCloseAt: now + settings.closeGraceMinutes * 60_000
      };
    }

    if (now >= tab.pendingCloseAt) {
      return {
        action: "CLOSE",
        reason: "Closure grace period elapsed"
      };
    }
  } else if (tab.pendingCloseAt) {
    return {
      action: "CANCEL_CLOSE",
      reason: "Tab no longer meets closure conditions"
    };
  }

  if (
    settings.sleepEnabled &&
    !tab.discarded &&
    inactiveMinutes >= settings.sleepAfterMinutes
  ) {
    return {
      action: "SLEEP",
      reason: `Inactive for ${Math.floor(inactiveMinutes)} minutes`
    };
  }

  return {
    action: "NONE",
    reason: "No lifecycle threshold reached"
  };
}
```

### Evaluation-order requirement

Closure eligibility must be evaluated before sleeping eligibility.

Otherwise a tab beyond the close threshold could repeatedly generate only a sleep action and never enter pending closure.

### Concurrency requirement

Prevent overlapping sweeps.

Use a service-worker-local mutex plus a persisted `lastSweepStartedAt` safeguard.

```ts
if (sweepInProgress) return;
```

Each tab action must be isolated with `try/catch` so one failure does not abort the full sweep.

---

## 17. Chrome Event Handling

Register listeners synchronously at the top level of the service worker.

Required listeners:

```ts
chrome.runtime.onInstalled
chrome.runtime.onStartup

chrome.tabs.onCreated
chrome.tabs.onUpdated
chrome.tabs.onActivated
chrome.tabs.onRemoved
chrome.tabs.onMoved
chrome.tabs.onAttached
chrome.tabs.onDetached
chrome.tabs.onReplaced

chrome.windows.onCreated
chrome.windows.onRemoved
chrome.windows.onFocusChanged

chrome.alarms.onAlarm
chrome.contextMenus.onClicked
chrome.commands.onCommand
chrome.runtime.onMessage
```

### Event responsibilities

#### `tabs.onCreated`

- Create a new tab record.
- Initialize activity time.
- Determine manageability.
- Broadcast state change to the side panel.

#### `tabs.onUpdated`

Update:

- URL.
- Normalized URL.
- Title.
- Favicon.
- Pinned status.
- Audible status.
- Discarded status.
- Loading status when needed.

If a pending-close tab becomes audible or pinned, cancel closure.

#### `tabs.onActivated`

- Mark the activated tab active.
- Update `lastActivatedAt`.
- Cancel pending closure.
- Update the previously active tab in that window.
- Record wake observation when a discarded tab becomes loaded again.

#### `tabs.onRemoved`

- Remove active tab metadata.
- Do not create a recovery record for ordinary user closures.
- Avoid duplicating records when removal was initiated by the extension.

#### `tabs.onMoved`, `onAttached`, and `onDetached`

Update window and index metadata.

#### `tabs.onReplaced`

Transfer tracked metadata from the old tab ID to the replacement tab ID when possible.

---

## 18. Service-Worker Scheduling

Create one alarm:

```text
lifecycle-sweep
```

Recommended schedule:

```ts
chrome.alarms.create("lifecycle-sweep", {
  periodInMinutes: 5
});
```

On every service-worker start:

```ts
const alarm = await chrome.alarms.get("lifecycle-sweep");

if (!alarm) {
  await createLifecycleAlarm();
}
```

Do not create one alarm per tab.

Each tab already has persisted timestamps. A single periodic sweep is simpler, more reliable, and easier to debug.

---

## 19. Message Contracts

Use typed messages between side panel and service worker.

```ts
type ExtensionRequest =
  | { type: "GET_APP_STATE" }
  | { type: "LOCK_TAB"; tabId: number }
  | { type: "UNLOCK_TAB"; tabId: number }
  | { type: "SLEEP_TAB"; tabId: number }
  | { type: "SLEEP_TABS"; tabIds: number[] }
  | { type: "CLOSE_TAB"; tabId: number }
  | { type: "CLOSE_TABS"; tabIds: number[] }
  | { type: "ACTIVATE_TAB"; tabId: number }
  | { type: "UPDATE_SETTINGS"; patch: Partial<ExtensionSettings> }
  | { type: "PAUSE_AUTOMATION" }
  | { type: "RESUME_AUTOMATION" }
  | { type: "RESTORE_RECOVERY"; recoveryId: string; lock: boolean }
  | { type: "DELETE_RECOVERY"; recoveryId: string }
  | { type: "CLEAR_ACTIVITY" }
  | { type: "CLEAR_RECOVERY" }
  | { type: "RUN_LIFECYCLE_SWEEP" };
```

```ts
type ExtensionBroadcast =
  | { type: "APP_STATE_CHANGED" }
  | { type: "TAB_RECORD_CHANGED"; tabId: number }
  | { type: "ACTIVITY_ADDED"; eventId: string }
  | { type: "TOAST"; toast: ToastPayload };
```

All message handlers must return structured errors:

```ts
interface ExtensionResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}
```

---

## 20. URL Normalization Foundation

Duplicate reuse is not part of version 0.1, but every tab record should include a normalized URL so later implementation does not require a schema redesign.

MVP normalization should:

- Lowercase scheme and hostname.
- Remove default ports.
- Sort query parameters.
- Remove an empty trailing `?`.
- Preserve path casing.
- Preserve fragments.
- Preserve all query parameters.
- Remove only known tracking parameters when that behavior is introduced under a separately tested feature flag.

Do not yet use normalized URLs to close or redirect any tabs.

Future duplicate handling will require two identifiers:

```ts
strictCanonicalUrl: string;
resourceKey?: string;
```

`strictCanonicalUrl` identifies effectively identical URLs.

`resourceKey` identifies an underlying domain-specific resource, such as:

```text
youtube:video:abc123
github:pull:owner/repository:342
amazon:asin:B012345678
google-doc:document-id
```

---

## 21. Permissions

Recommended MVP permissions:

```json
{
  "permissions": [
    "tabs",
    "storage",
    "alarms",
    "sidePanel",
    "contextMenus"
  ]
}
```

Add `commands` through the manifest’s `commands` configuration.

Do not request in version 0.1:

```text
bookmarks
notifications
webNavigation
sessions
history
scripting
unlimitedStorage
```

Do not declare broad host permissions.

Avoiding host permissions and content scripts means the MVP will not inspect page content or detect unsaved forms. This limitation must be documented in onboarding and release notes.

---

## 22. Suggested Manifest

```json
{
  "manifest_version": 3,
  "name": "Tab Lifecycle Manager",
  "version": "0.1.0",
  "description": "Sleep, protect, and automatically clean up inactive tabs.",

  "minimum_chrome_version": "116",

  "permissions": [
    "tabs",
    "storage",
    "alarms",
    "sidePanel",
    "contextMenus"
  ],

  "background": {
    "service_worker": "background.js",
    "type": "module"
  },

  "action": {
    "default_title": "Open Tab Lifecycle Manager"
  },

  "side_panel": {
    "default_path": "sidepanel.html"
  },

  "commands": {
    "toggle-tab-lock": {
      "suggested_key": {
        "default": "Ctrl+Shift+L",
        "mac": "Command+Shift+L"
      },
      "description": "Toggle automatic-close protection for the active tab"
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

---

## 23. Recommended Technical Stack

For implementation speed:

```text
TypeScript
React
Vite
Manifest V3
Chrome extension APIs
CSS Modules or plain CSS
Vitest for unit tests
Playwright for limited end-to-end browser tests
```

Avoid introducing:

- A backend.
- Authentication.
- A database library.
- Redux or another heavy global state library.
- An AI SDK.
- A CSS component framework unless it materially accelerates implementation.

The side panel may use React context or a small store, but persistent business state remains owned by the service worker and Chrome storage.

---

## 24. Suggested Repository Structure

```text
tab-lifecycle-manager/
├── public/
│   ├── manifest.json
│   └── icons/
│       ├── icon-16.png
│       ├── icon-32.png
│       ├── icon-48.png
│       └── icon-128.png
│
├── src/
│   ├── background/
│   │   ├── index.ts
│   │   ├── listeners.ts
│   │   ├── lifecycle-engine.ts
│   │   ├── lifecycle-sweep.ts
│   │   ├── tab-repository.ts
│   │   ├── lock-service.ts
│   │   ├── recovery-service.ts
│   │   ├── activity-service.ts
│   │   ├── alarm-service.ts
│   │   ├── reconciliation-service.ts
│   │   └── context-menu-service.ts
│   │
│   ├── sidepanel/
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── views/
│   │   │   ├── TabsView.tsx
│   │   │   ├── ActivityView.tsx
│   │   │   ├── RecoveryView.tsx
│   │   │   └── SettingsView.tsx
│   │   ├── components/
│   │   │   ├── TabRow.tsx
│   │   │   ├── TabStatus.tsx
│   │   │   ├── LockButton.tsx
│   │   │   ├── BulkActionBar.tsx
│   │   │   ├── ActivityItem.tsx
│   │   │   ├── RecoveryItem.tsx
│   │   │   ├── Toast.tsx
│   │   │   └── EmptyState.tsx
│   │   └── hooks/
│   │       ├── useAppState.ts
│   │       └── useExtensionMessage.ts
│   │
│   ├── shared/
│   │   ├── types.ts
│   │   ├── messages.ts
│   │   ├── defaults.ts
│   │   ├── url-normalizer.ts
│   │   ├── eligibility.ts
│   │   ├── time.ts
│   │   └── errors.ts
│   │
│   └── tests/
│       ├── lifecycle-engine.test.ts
│       ├── eligibility.test.ts
│       ├── url-normalizer.test.ts
│       └── recovery-service.test.ts
│
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 25. Privacy and Security Requirements

### PRV-001

No data may leave the local browser profile.

### PRV-002

The extension must not include analytics, telemetry, advertisements, or remote logging in version 0.1.

### PRV-003

The extension must not request host permissions.

### PRV-004

Do not inject content scripts.

### PRV-005

Do not store URL information in console logs in production builds.

### PRV-006

Do not manage incognito tabs.

### PRV-007

Do not execute arbitrary strings or use `eval`.

### PRV-008

All HTML rendering must escape tab titles and URLs. Treat page-provided text as untrusted.

### PRV-009

Recovery and activity history must have user-visible clear controls.

---

## 26. Performance Requirements

### PERF-001

The side panel should render 200 open tabs without blocking user input for more than 200 milliseconds at a time.

### PERF-002

Search and filtering should respond within 100 milliseconds for 500 tab records on a typical desktop computer.

### PERF-003

A lifecycle sweep over 500 tabs should not perform unnecessary storage writes for unchanged records.

### PERF-004

Batch related storage updates.

### PERF-005

Do not wake the service worker solely to update visual relative-time labels. The side panel handles those display updates while open.

### PERF-006

Do not poll `chrome.tabs.query()` from the UI every second. Use event-driven updates and explicit refreshes.

---

## 27. Accessibility Requirements

- Every icon-only button must have an accessible label.
- All actions must be keyboard reachable.
- Lock state must not be communicated by color alone.
- Focus indicators must be visible.
- Status text must remain readable at 200% zoom.
- Toasts must use an `aria-live` region.
- Confirmation dialogs must trap focus correctly.
- Hover-only controls must also appear on keyboard focus.

---

## 28. Error Handling

Use stable error codes.

```text
TAB_NOT_FOUND
TAB_NOT_MANAGEABLE
TAB_IS_ACTIVE
TAB_ALREADY_DISCARDED
TAB_DISCARD_FAILED
TAB_REMOVE_FAILED
RECOVERY_NOT_FOUND
WINDOW_NOT_FOUND
STORAGE_READ_FAILED
STORAGE_WRITE_FAILED
INVALID_SETTINGS
AUTOMATION_PAUSED
UNKNOWN_ERROR
```

Every caught Chrome runtime error should be converted into:

```ts
{
  code: "TAB_DISCARD_FAILED",
  message: "Chrome could not put this tab to sleep."
}
```

Do not display raw stack traces to users.

Raw errors may be logged in development builds.

---

## 29. Edge Cases

The implementation must explicitly handle:

### Tab closes during a sweep

Skip it and continue.

### Tab becomes active before removal

Re-fetch the tab immediately before automatic closure. Cancel if active.

### Tab becomes audible before removal

Re-fetch and cancel.

### Tab becomes locked while a sweep is running

Read the latest lock state before removal.

### Browser sleeps longer than the threshold

Run one evaluation after wake. Do not create duplicate activity events for every missed interval.

### Extension is reloaded

Reconcile storage with current tabs.

### Window closes

Remove its tab records. Do not create extension recovery records unless the extension initiated each closure.

### Duplicate URLs

Manage each as an independent tab in version 0.1.

### Missing URL or title

Display safe placeholders and mark actions unavailable when required.

### Discard fails

Record an error and leave the tab unchanged.

### Close succeeds but activity write fails

The recovery snapshot must already exist. Retry or record the activity write during the next reconciliation.

### Recovery target window no longer exists

Restore into the current normal window.

### User manually closes a locked tab

Allow it. Do not reopen it.

---

## 30. Testing Requirements

### 30.1 Unit tests

The lifecycle evaluator must be comprehensively unit-tested.

Required cases:

1. Active tab never sleeps.
2. Active tab never closes.
3. Pinned tab never sleeps automatically.
4. Pinned tab never closes automatically.
5. Audible tab never sleeps automatically.
6. Audible tab never closes automatically.
7. Locked background tab sleeps after the sleep threshold.
8. Locked tab never enters pending closure.
9. Unlocked tab enters pending closure after close threshold.
10. Pending tab closes after grace period.
11. Activating a pending tab cancels closure.
12. Locking a pending tab cancels closure.
13. Pausing automation cancels closure.
14. Unavailable tab receives no lifecycle action.
15. A tab is not repeatedly scheduled for closure.
16. A sleeping tab can still enter pending closure.
17. A failed tab action does not terminate a sweep.
18. Restoring a recovery record creates the correct request.
19. Activity retention removes expired records.
20. URL normalization is deterministic.

### 30.2 Manual integration tests

Use an unpacked extension and verify:

- Side panel opens from the toolbar.
- Tab creation appears immediately.
- Tab closure disappears immediately.
- Switching tabs updates activity.
- Lock context menu works.
- Keyboard shortcut works.
- Manual sleep works.
- Automatic sleep works with a temporarily short threshold.
- Pending closure appears.
- Closure is canceled by activation.
- Closure is canceled by locking.
- Automatic closure creates a recovery item.
- Restore works after the original window is closed.
- Browser restart preserves settings and activity.
- Extension reload does not duplicate context-menu items.
- Browser sleep/wake does not duplicate closure events.

### 30.3 Destructive-action test mode

Add a development-only configuration:

```ts
const DEV_FAST_LIFECYCLE = {
  sleepAfterMinutes: 1,
  closeAfterMinutes: 2,
  closeGraceMinutes: 1
};
```

This must never be used in production defaults.

---

## 31. Suggested Implementation Roadmap

### Milestone 0: Project skeleton

**Priority:** P0

Deliver:

- Manifest V3 extension loads successfully.
- TypeScript build works.
- Side panel opens from toolbar.
- Service worker starts without errors.
- Current tabs are listed.
- Basic storage repositories exist.
- Shared types and message contracts exist.

Do not proceed until the extension can be repeatedly loaded and reloaded through `chrome://extensions` without errors.

### Milestone 1: Manual control center

**Priority:** P0

Deliver:

- Tab inventory across normal windows.
- Active/background/idle status.
- Search and state filtering.
- Activate-tab action.
- Lock/unlock.
- Manual sleep.
- Manual close.
- Context-menu lock command.
- Keyboard lock command.
- Basic settings persistence.

At the end of this milestone, the extension is already useful as a manual tab manager.

### Milestone 2: Automated lifecycle

**Priority:** P0

Deliver:

- Activity tracking.
- Lifecycle alarm.
- Startup reconciliation.
- Automatic sleeping.
- Pending-close state.
- Automatic closure.
- Safety exclusions.
- Global pause.
- Conservative onboarding.

At the end of this milestone, the original automatic tab-cleanup use case is functional.

### Milestone 3: Trust and recovery

**Priority:** P0

Deliver:

- Activity feed.
- Aggregated events.
- Recovery records.
- Restore.
- Restore and lock.
- In-panel toasts.
- Clear action reasons.
- Error handling.
- Retention cleanup.

At the end of this milestone, the extension is suitable for sustained personal dogfooding.

### Milestone 4: Stabilization

**Priority:** P0

Deliver:

- Lifecycle unit tests.
- Storage migration support.
- Edge-case handling.
- Accessibility pass.
- Performance pass with at least 200 tabs.
- README installation instructions.
- Known-limitations documentation.
- Production defaults verification.

This completes version 0.1.

---

## 32. Post-MVP Roadmap

### Version 0.2: Exact duplicate reuse

**Priority:** P1

Deliver:

- Strict URL canonicalization.
- Exact duplicate detection.
- Existing-tab lookup across windows.
- Wake and focus an existing sleeping tab.
- Close the newly created duplicate.
- Per-domain exclusion list.
- Activity event explaining duplicate reuse.
- `Open new anyway` escape hatch.
- Feature toggle disabled by default during initial testing.

Success criterion:

```text
Opening an equivalent URL focuses the existing tab without losing meaningful URL state.
```

### Version 0.3: Better URL identity

**Priority:** P1

Deliver:

- Tracking-parameter removal.
- Configurable ignored parameters.
- Google Search query normalization.
- YouTube video identity.
- GitHub issue and pull-request identity.
- Google Docs document identity.
- Amazon product identity.
- Per-site duplicate policies.

Automatic reuse remains limited to high-confidence matches.

Similar but non-identical pages generate suggestions rather than automatic redirection.

### Version 0.4: Retention archive

**Priority:** P1

Deliver:

- `Save for later`.
- Archive instead of close.
- Searchable archive.
- Saved reason and date.
- Notes.
- Reopen.
- Promote to Chrome bookmark manually.
- Archive-retention settings.

Automatic closure policy becomes:

```text
Disposable → close
Uncertain → archive
Protected → keep
```

Classification remains manual or rule-based.

### Version 0.5: Temporary and broader locks

**Priority:** P1

Deliver:

- Lock for a selected duration.
- Lock until browser restart.
- Lock until next visit.
- Domain lock.
- URL-pattern lock.
- Native tab-group lock.
- Separate `Keep awake` option.

### Version 0.6: Research sessions

**Priority:** P2

Deliver:

- User-created collections.
- Convert tab group to collection.
- Archive or restore a collection.
- Lock a collection.
- Preserve source and parent-child relationships.
- Suggested session grouping based on opening time and navigation relationships.

### Version 0.7: Smart retention

**Priority:** P2

Deliver:

- Retention scoring.
- Revisit count.
- Active reading duration.
- Copy-event signals, requiring explicit additional permissions.
- Research-session membership.
- User feedback from restores and manual closes.
- `Likely useful later` suggestions.
- Optional local semantic classification.

Do not automatically bookmark or permanently retain pages without an explicit user rule.

### Version 0.8: Enhanced notifications

**Priority:** P2

Deliver:

- Optional system notifications.
- Daily summary.
- Quiet hours.
- Notification preferences by event.
- Warnings before large cleanup operations.
- Suggestions based on repeated undo behavior.

---

## 33. Immediate Backlog Priority

### Must have before personal use

```text
P0-01 Extension scaffold
P0-02 Side-panel tab list
P0-03 Tab-state tracking
P0-04 Lock/unlock
P0-05 Manual sleep
P0-06 Settings
P0-07 Alarm lifecycle sweep
P0-08 Automatic sleep
P0-09 Pending closure
P0-10 Automatic closure
P0-11 Safety exclusions
P0-12 Recovery records
P0-13 Restore
P0-14 Activity feed
P0-15 Global pause
P0-16 Startup reconciliation
P0-17 Core unit tests
```

### Complete shortly afterward

```text
P1-01 Exact duplicate matching
P1-02 Reuse existing idle tab
P1-03 Duplicate exceptions
P1-04 Save for later
P1-05 Archive
P1-06 Temporary locks
P1-07 Domain locks
P1-08 Group locks
```

### Explicitly defer

```text
P2-01 Semantic similarity
P2-02 Automatic topic classification
P2-03 Research-session detection
P2-04 Auto-bookmarking
P2-05 Remote AI integration
P2-06 Cloud sync
```

---

## 34. Definition of Done for Version 0.1

Version 0.1 is done only when all statements are true:

- The extension can be loaded unpacked with no manifest errors.
- The side panel opens from the toolbar action.
- All normal-window tabs appear.
- Lifecycle status updates live.
- A tab can be locked and unlocked.
- A locked tab is never automatically closed.
- A locked tab can still be slept.
- A background tab can be manually slept.
- Inactive tabs sleep automatically.
- Eligible tabs enter pending closure.
- The grace period is honored.
- Active, pinned, audible, locked, and unavailable tabs are not automatically closed.
- Every automatic action has a human-readable reason.
- Automatically closed tabs appear in Recovery.
- Recovery successfully reopens a tab.
- Automation can be paused globally.
- Settings survive restart.
- State reconciles after service-worker termination and extension reload.
- Core lifecycle tests pass.
- No browsing data is transmitted externally.
- No content scripts or host permissions are used.
- Known limitations are documented.

---

## 35. AI Implementation Instructions

An AI coding agent receiving this specification must follow these constraints:

1. Implement milestones in order.
2. Do not add post-MVP features while completing P0.
3. Do not introduce a backend.
4. Do not introduce AI classification.
5. Do not request unlisted permissions.
6. Do not inject scripts into webpages.
7. Keep lifecycle evaluation in a pure, unit-testable module.
8. Persist all important state; do not depend on service-worker globals.
9. Re-fetch tab state immediately before destructive automatic actions.
10. Create recovery data before removing a tab.
11. Treat tab titles and URLs as untrusted display strings.
12. Prefer readable, typed code over abstractions designed for hypothetical future scale.
13. Add tests with every lifecycle-rule implementation.
14. Document any deviation from the PRD before implementing it.
15. Never silently weaken a safety exclusion.

The first implementation task should be:

```text
Create a Manifest V3 TypeScript extension whose toolbar action opens a
persistent side panel. The panel must query and display all tabs in normal
Chrome windows, grouped by window, with active, discarded, pinned, and audible
state. Add typed message contracts between the side panel and service worker.
Do not implement automation yet.
```
