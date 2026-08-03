import { describe, expect, it } from "vitest";
import { hasPanelOpenShortcut } from "../background/shortcut-service.ts";

describe("shortcut-service", () => {
  it("hasPanelOpenShortcut detects assigned open shortcut", () => {
    expect(
      hasPanelOpenShortcut([
        { name: "_execute_action", shortcut: "" },
        { name: "open-side-panel", shortcut: "Alt+Shift+T" },
      ]),
    ).toBe(true);
  });

  it("hasPanelOpenShortcut is false when all shortcuts empty", () => {
    expect(
      hasPanelOpenShortcut([
        { name: "_execute_action", shortcut: "" },
        { name: "open-side-panel", shortcut: "" },
      ]),
    ).toBe(false);
  });
});
