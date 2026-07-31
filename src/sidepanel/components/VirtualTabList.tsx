/**
 * Tab list entry point: plain list for typical profiles, dynamic virtual list at scale.
 */
import { lazy, Suspense } from "react";
import { PlainTabList, type TabListProps } from "./PlainTabList.tsx";
import { VIRTUAL_LIST_THRESHOLD } from "./virtual-tab-list-types.ts";

export type { TabListEntry } from "./virtual-tab-list-types.ts";

const VirtualizedTabList = lazy(() =>
  import("./VirtualizedTabList.tsx").then((mod) => ({ default: mod.VirtualizedTabList })),
);

export function VirtualTabList(props: TabListProps) {
  if (props.entries.length < VIRTUAL_LIST_THRESHOLD) {
    return <PlainTabList {...props} />;
  }

  return (
    <Suspense fallback={<PlainTabList {...props} />}>
      <VirtualizedTabList {...props} />
    </Suspense>
  );
}
