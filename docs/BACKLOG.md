# Backlog — deferred ideas

Items here are intentionally out of scope for the current milestone. They are
recorded so we do not lose context from design discussions.

---

## Native Chrome tab strip status indicators

**Requested:** Show lifecycle state on each **browser tab in Chrome’s tab bar**
(not only in the side-panel manager).

**Current behavior (v0.1):**

- **Sleeping** tabs are visible natively — Chrome dims discarded tabs after
  `chrome.tabs.discard()`.
- **Locked, pending close, snoozed, keep loaded** are **not** shown on native
  tabs; they appear only in the side panel.
- The extension toolbar badge shows aggregate state (pending-close count or
  paused), not per-tab marks.

**Why deferred:**

- Extensions cannot draw overlays on the tab strip.
- Workarounds (rewriting tab titles with prefixes/icons) are noisy, fight site
  titles, and reset on navigation — ruled out in `docs/QUESTIONS_AND_GAPS.md`
  (H10).
- Safer alternatives to explore later: onboarding copy (“sleeping tabs look
  faded”), optional Tab Groups labeling, or waiting for a stable
  `sidePanel.toggle()` / tab-strip API if Chrome adds one.

**Priority:** P2 (polish / discoverability)

**Related:** `docs/QUESTIONS_AND_GAPS.md` § H10

---

## Research topic tab groups (smart resurfacing)

**Idea:** When a user did research in the past with many related tabs open, group those
tabs by topic. Later, when they search or open something related, suggest reopening
that research group so prior context compounds instead of being lost.

**Example flow:**

- User had 12 tabs open about "Bolt.new careers" and "AI app builders" — extension
  clusters them into a latent "AI builder research" group.
- Weeks later they open a tab about "Bubble.io editor" — panel suggests: "Resume your
  AI app builder research? (8 tabs from 3 weeks ago)".

**Why deferred:**

- Grouping requires semantic understanding of tab titles/URLs beyond hostname rules.
  Heuristics (shared domain, time co-activation) help but miss cross-site research
  threads.
- Retrieval ("is this new tab related to an old group?") likely needs embeddings or an
  on-device LLM — conflicts with current **no network / no ML** MVP constraints unless
  scoped carefully (optional local model, user opt-in, privacy review).
- UX questions remain open: auto vs manual groups, merge/split, stale group expiry,
  and how suggestions appear without being noisy.

**Brainstorm directions (for a future design spike):**

1. **Time + co-activation clustering** (no ML): tabs opened/activated together in a
   session become a group; suggest when user opens a tab on the same registrable domain
   or matching search keywords in title.
2. **On-device embeddings** (privacy-preserving): embed title + hostname locally;
   similarity search over closed/sleeping tab history; no URLs leave the device.
3. **Explicit "Research session"** mode: user starts/ends a named session; extension
   only groups tabs while mode is on — simpler, no inference.
4. **Integration with Chrome Tab Groups**: persist group metadata + lifecycle state so
   sleeping/closing respects research bundles.

**Priority:** P3 (future / needs design spike)

**Related:** PRD §11 (activity feed), recovery history, `docs/QUESTIONS_AND_GAPS.md`

---

## Arc unloaded sidebar inventory (macOS companion)

**Requested:** Show Arc sidebar tabs that Chromium has **not loaded** in the tab
manager, and assign lifecycle display states (background / idle / asleep) without
the user clicking each tab to load it first.

**Current behavior (v0.1):**

- Inventory comes from `chrome.tabs` reconciliation only.
- Arc keeps many sidebar entries unloaded; they are invisible to extensions until
  the user activates them in Arc (confirmed limitation).
- Inactivity timers (`lastActivatedAt`, `lastAccessed`) exist only for tabs
  Chromium has loaded at least once in the session.

**Why the extension alone cannot do this:**

- MV3 extensions cannot read `~/Library/Application Support/Arc/StorableSidebar.json`
  or run AppleScript directly.
- Unloaded sidebar entries are not in `chrome.tabs` — no tab id, no
  `lastAccessed`, no `discard()`.

**Possible macOS-only path (optional, user-installed companion):**

1. **Native messaging host** (or documented CLI the user runs) reads Arc sidebar
   data:
   - **StorableSidebar.json** — full Space / folder / pinned tab inventory
     (`savedURL`, `savedTitle`, Arc internal ids). Used by community tools
     (`arc-mcp`, bookmark exporters, migration scripts).
   - **AppleScript** — list tabs in loaded Spaces with `location` (sidebar vs
     little arc). Does not expose reliable `lastAccessed` for unloaded entries.
2. **Merge into extension inventory:**
   - Match Arc-only rows to Chromium records by normalized URL (+ title fallback).
   - Synthetic ids for sidebar-only rows (negative or string `arc:` prefix).
   - New fields: `loadedInChromium: boolean`, `arcSidebarId?: string`,
     `inventorySource: "chromium" | "arc_sidebar"`.
3. **Display states for unloaded rows:**
   - New display state e.g. `UNLOADED` or reuse `IDLE` with badge “not loaded”.
   - **Inactivity time:** best-effort only:
     - URL-keyed **ledger** (`lastActivatedAt` from prior sessions when that URL
       was loaded) — good for “you opened this weeks ago” hints.
     - Sidebar JSON metadata if Arc stores timestamps (needs spike; often absent).
     - Otherwise show “inactive time unknown until loaded”.
4. **Automation (sleep / close):**
   - `chrome.tabs.discard` / `remove` do not apply to unloaded sidebar entries.
   - Actions need the native host: remove tab from StorableSidebar (Arc restart
     or sync caveats) or AppleScript “open URL then discard” (loads the tab —
     defeats “unload” but matches Chrome sleep semantics).

**Platform / product constraints:**

- macOS only; Windows Arc paths differ (`AppData\Local\Packages\…`).
- User must install and trust a native companion; document in onboarding as opt-in.
- Arc Sync may overwrite direct JSON edits — same caveat as other Arc automation tools.
- Privacy: companion reads local Arc data only; extension CSP stays `connect-src 'none`.

**MVP scope suggestion:**

- Phase 1: companion lists sidebar tabs → panel shows them as `UNLOADED` with URL
  ledger inactive estimate; no automatic sleep/close.
- Phase 2: user-initiated “remove from sidebar” / “load and sleep” via native host.
- Phase 3: automatic rules for unloaded rows (policy + UX review).

**Priority:** P2 on Arc (discoverability / parity with Chrome inventory)

**Related:** `KNOWN_LIMITATIONS.md` §4, `src/shared/strings.ts` `arcInventoryNote`
