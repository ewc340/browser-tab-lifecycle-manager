import { describe, expect, it } from "vitest";
import type { ActivityEvent } from "../../shared/types.ts";
import { filterActivityEvents, matchesActivityFilter } from "../../shared/activity-filters.ts";

function event(partial: Partial<ActivityEvent> & Pick<ActivityEvent, "type" | "source">): ActivityEvent {
  return {
    id: "e1",
    occurredAt: 1,
    message: "test",
    tabs: [],
    reversible: false,
    ...partial,
  };
}

describe("activity filters", () => {
  it("matches automatic source", () => {
    const e = event({ type: "TABS_SLEPT", source: "AUTOMATIC_SLEEP" });
    expect(matchesActivityFilter(e, "automatic")).toBe(true);
    expect(matchesActivityFilter(e, "manual")).toBe(false);
  });

  it("matches sleep types", () => {
    expect(matchesActivityFilter(event({ type: "TABS_SLEPT", source: "AUTOMATIC_SLEEP" }), "sleep")).toBe(
      true,
    );
    expect(matchesActivityFilter(event({ type: "TAB_LOCKED", source: "MANUAL" }), "sleep")).toBe(false);
  });

  it("matches close types including would-close", () => {
    expect(
      matchesActivityFilter(event({ type: "TAB_WOULD_CLOSE", source: "AUTOMATIC_REPORT_ONLY" }), "close"),
    ).toBe(true);
  });

  it("filters a list", () => {
    const events = [
      event({ id: "a", type: "TAB_LOCKED", source: "MANUAL" }),
      event({ id: "b", type: "TABS_SLEPT", source: "AUTOMATIC_SLEEP" }),
    ];
    expect(filterActivityEvents(events, "protection")).toHaveLength(1);
    expect(filterActivityEvents(events, "all")).toHaveLength(2);
  });
});
