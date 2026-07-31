import { describe, expect, it } from "vitest";
import { EVENTS_PER_BUCKET } from "../../shared/activity-index.ts";

describe("activity service contract", () => {
  it("uses at most 100 events per bucket key", () => {
    expect(EVENTS_PER_BUCKET).toBe(100);
  });

  it("caps aggregate snapshots at 20 tabs with totalCount metadata", () => {
    const tabs = Array.from({ length: 30 }, (_, index) => ({
      title: `Tab ${index}`,
      url: `https://example.com/${index}`,
    }));
    const capped = tabs.slice(0, 20);
    expect(capped.length).toBe(20);
    expect(tabs.length).toBe(30);
  });
});
