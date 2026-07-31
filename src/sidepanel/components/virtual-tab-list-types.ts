import type { TabView } from "../../shared/types.ts";

export type TabListEntry =
  | { kind: "window"; key: string; label: string; count: number }
  | { kind: "tab"; key: string; tab: TabView };

/** Tab count above which the virtualized renderer is loaded. */
export const VIRTUAL_LIST_THRESHOLD = 80;
