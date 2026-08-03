import { describe, expect, it } from "vitest";
import { isNativeSidePanelApiComplete } from "../background/side-panel-service.ts";

describe("side-panel-service", () => {
  it("isNativeSidePanelApiComplete requires open and setOptions", () => {
    const original = globalThis.chrome;
    try {
      globalThis.chrome = {
        sidePanel: {
          open: () => Promise.resolve(),
          setOptions: () => Promise.resolve(),
        },
      } as unknown as typeof chrome;
      expect(isNativeSidePanelApiComplete()).toBe(true);

      globalThis.chrome = {
        sidePanel: {
          open: () => Promise.resolve(),
        },
      } as unknown as typeof chrome;
      expect(isNativeSidePanelApiComplete()).toBe(false);

      globalThis.chrome = {
        sidePanel: {
          open: undefined,
          setOptions: undefined,
        },
      } as unknown as typeof chrome;
      expect(isNativeSidePanelApiComplete()).toBe(false);
    } finally {
      globalThis.chrome = original;
    }
  });
});
