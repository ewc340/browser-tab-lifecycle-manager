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
