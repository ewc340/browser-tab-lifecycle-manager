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
