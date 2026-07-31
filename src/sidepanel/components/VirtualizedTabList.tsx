/**
 * Virtualized tab list for large profiles (80+ visible rows).
 *
 * Loaded dynamically so @tanstack/react-virtual is not in the initial panel
 * bundle path for typical tab counts.
 */
import { useLayoutEffect, useRef, useState } from "react";
/* eslint-disable react-hooks/incompatible-library -- TanStack Virtual returns unstable function refs by design. */
import { useVirtualizer } from "@tanstack/react-virtual";
import { TabRow } from "./TabRow.tsx";
import type { TabListProps } from "./PlainTabList.tsx";

const ROW_HEIGHT = 56;
const HEADER_HEIGHT = 36;

export function VirtualizedTabList(props: TabListProps) {
  const { entries } = props;
  const parentRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useLayoutEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const update = () => setReady(el.clientHeight > 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => (entries[index]?.kind === "window" ? HEADER_HEIGHT : ROW_HEIGHT),
    overscan: 8,
    debug: false,
  });

  const virtualItems = ready ? virtualizer.getVirtualItems() : [];

  return (
    <div ref={parentRef} className="virtual-tab-list" role="list">
      <div
        className="virtual-tab-list__inner"
        style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
      >
        {virtualItems.map((item) => {
          const entry = entries[item.index];
          if (entry === undefined) return null;

          if (entry.kind === "window") {
            return (
              <div
                key={entry.key}
                className="window-group__title virtual-tab-list__header"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${item.start}px)`,
                  height: `${item.size}px`,
                }}
              >
                <span>{entry.label}</span>
                <span className="window-group__count">
                  {entry.count} tab{entry.count !== 1 ? "s" : ""}
                </span>
              </div>
            );
          }

          return (
            <div
              key={entry.key}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                transform: `translateY(${item.start}px)`,
                height: `${item.size}px`,
              }}
            >
              <TabRow
                tab={entry.tab}
                now={props.now}
                extensionId={props.extensionId}
                bulkMode={props.bulkMode}
                selected={props.selectedIds.has(entry.tab.tabId)}
                onActivate={props.onActivate}
                onToggleSelect={props.onToggleSelect}
                onLock={props.onLock}
                onUnlock={props.onUnlock}
                onSleep={props.onSleep}
                onWake={props.onWake}
                onClose={props.onClose}
                onKeepLoaded={props.onKeepLoaded}
                onSnooze={props.onSnooze}
                onNeverCloseSite={props.onNeverCloseSite}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
