/**
 * User-facing copy in one place so wording stays consistent across the panel,
 * toasts, and context menus.
 */
export const STRINGS = {
  lock: {
    action: "Lock from automatic closure",
    unlock: "Unlock",
    lockedToast: (title: string) => `"${title}" is protected from automatic closure.`,
    unlockedToast: (title: string) => `"${title}" is no longer protected.`,
    bulkLocked: (count: number) =>
      `${count} tab${count === 1 ? "" : "s"} protected from automatic closure.`,
    bulkUnlocked: (count: number) =>
      `${count} tab${count === 1 ? "" : "s"} unlocked.`,
    contextMenuLock: "Keep this tab (protect from automatic closing)",
    contextMenuUnlock: "Unlock this tab",
  },
  sleep: {
    action: "Sleep now",
    wake: "Wake",
    sleptToast: (title: string) => `"${title}" was put to sleep.`,
    wokenToast: (title: string) => `"${title}" was woken.`,
    bulkSlept: (count: number) => `${count} tab${count === 1 ? "" : "s"} put to sleep.`,
    bulkWoken: (count: number) => `${count} tab${count === 1 ? "" : "s"} woken.`,
    contextMenu: "Sleep this tab now",
  },
  close: {
    action: "Close tab",
    manualAction: "Close tab manually",
    bulkAction: "Close",
    confirmTitle: "Close selected tabs?",
    confirmBody: (count: number) =>
      `Close ${count} tab${count === 1 ? "" : "s"}? Closed tabs can be restored from the Recovery view.`,
    confirmMore: (count: number) => `and ${count} more`,
    closedToast: (title: string) => `"${title}" was closed.`,
    bulkClosed: (count: number) => `${count} tab${count === 1 ? "" : "s"} closed.`,
  },
  keepLoaded: {
    on: "Keep loaded",
    off: "Allow sleeping",
    enabledToast: (title: string) => `"${title}" will stay loaded in memory.`,
    disabledToast: (title: string) => `"${title}" can sleep when inactive.`,
  },
  snooze: {
    action: "Snooze 7 days",
    snoozedToast: (title: string) => `"${title}" is snoozed for 7 days.`,
    sevenDays: 7 * 24 * 60 * 60 * 1000,
  },
  hostRule: {
    neverClose: "Never close this site",
    neverSleep: "Never sleep this site",
    cleared: "Site rule removed.",
    neverCloseSet: (host: string) => `${host} will not be closed automatically.`,
    neverSleepSet: (host: string) => `${host} will not be put to sleep automatically.`,
  },
  tab: {
    goTo: "Go to tab",
    copyUrl: "Copy URL",
    urlCopied: "URL copied to clipboard.",
  },
  bulk: {
    selectTabs: "Select tabs",
    selecting: "Selecting",
    hint: "Click tabs to select. Shift-click to select a range.",
    selectAll: "Select all filtered",
    sleep: "Sleep",
    lock: "Lock",
    unlock: "Unlock",
    close: "Close selected",
    clearSelection: "Clear selection",
    selectedCount: (count: number) => `${count} selected`,
    unlockConfirmTitle: "Unlock many tabs?",
    unlockConfirmBody: (count: number) => `Unlock ${count} protected tabs?`,
  },
  undo: "Undo",
  settings: {
    shortcutsLink: "Set keyboard shortcuts",
    automationInert: "Automatic management is configured here but stays off until you finish onboarding.",
    pauseAutomation: "Pause automatic management",
    resumeAutomation: "Resume automatic management",
    automationPaused: "Automatic management is paused. Pending closures were cancelled.",
  },
  reportOnly: {
    title: (count: number) =>
      `Report-only: cleanup would have closed ${count} tab${count === 1 ? "" : "s"}.`,
    review: "Review tabs",
    enableClosing: "Enable automatic closing",
    extend: "Extend 7 days",
  },
  tooltips: {
    sleep: "Put tab to sleep to free memory",
    wake: "Wake tab and reload its page",
    snooze: "Snooze automatic management for 7 days",
    close: "Close this tab",
    closeManual: "Close this protected tab manually",
    more: "More actions",
    pinned: "Pinned — excluded from automatic closure",
    audible: "Playing audio — excluded from automatic closure",
    keepLoaded: "Kept loaded — won't sleep automatically",
    locked: "Protected from automatic closure",
    inactive: (duration: string) => `Last active ${duration} ago`,
    state: {
      ACTIVE: "Active — currently in use",
      BACKGROUND: "Background — open but not active",
      IDLE: "Idle — inactive; may sleep or close soon",
      PENDING_CLOSE: "Closing soon — automatic closure scheduled",
      UNAVAILABLE: "Unavailable — this page cannot be managed",
    },
  },
  tabsView: {
    arcInventoryNote:
      "Arc sidebar tabs that are not loaded are invisible to extensions — Chromium never reports them or their last-active time until you click the tab. Switch to that Space, load tabs you want managed, then refresh. An optional macOS companion (planned) could list unloaded sidebar tabs from Arc’s local data.",
    refreshInventory: "Refresh tab list",
  },
  threadsView: {
    hint:
      "Threads group visits by entity keys (e.g. PROJ-412) or same-window browsing bursts. Debug view — last 7 days. No automatic nudges yet.",
    loading: "Loading threads…",
    empty: "No threads yet. Browse with the extension enabled; visits cluster when tabs close or navigate.",
    orphans: (count: number) =>
      `${count} ended visit${count === 1 ? "" : "s"} could not be clustered (e.g. privileged URLs with no host).`,
    refresh: "Refresh threads",
  },
} as const;
