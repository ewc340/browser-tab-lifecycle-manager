/**
 * The product's identity, defined once.
 *
 * Both the manifest and the UI read the name from here so renaming the extension is a
 * one-line change (DECISIONS.md #1). Never hardcode the name anywhere else, and never
 * use it in a storage key.
 */
export const PRODUCT_NAME = "Browser Tab Lifecycle Manager";

/** Used where the full name would wrap, e.g. the panel header at 320px. */
export const PRODUCT_SHORT_NAME = "Tab Lifecycle";

export const PRODUCT_TAGLINE = "Sleep, protect, and clean up inactive tabs.";

export const REPOSITORY_URL = "https://github.com/ewc340/browser-tab-lifecycle-manager";

export const ISSUES_URL = `${REPOSITORY_URL}/issues`;
