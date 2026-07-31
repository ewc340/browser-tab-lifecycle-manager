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
      `Close ${count} tabs? Closed tabs can be restored from the Recovery view.`,
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
    sleep: "Sleep",
    lock: "Lock",
    unlock: "Unlock",
    close: "Close",
    clearSelection: "Clear selection",
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
} as const;
