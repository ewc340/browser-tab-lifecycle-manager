import { describe, expect, it } from "vitest";
import { clampRestoreIndex, selectRestoreWindowId } from "../../shared/recovery-restore.ts";

describe("selectRestoreWindowId", () => {
  it("prefers the original window when it still exists", () => {
    expect(selectRestoreWindowId(5, [3, 5, 7], 3)).toBe(5);
  });

  it("falls back to the focused normal window", () => {
    expect(selectRestoreWindowId(99, [3, 7], 7)).toBe(7);
  });

  it("uses any open normal window as last resort", () => {
    expect(selectRestoreWindowId(99, [3], undefined)).toBe(3);
  });
});

describe("clampRestoreIndex", () => {
  it("appends at end when index is undefined", () => {
    expect(clampRestoreIndex(undefined, 4)).toBe(4);
  });

  it("clamps to tab count", () => {
    expect(clampRestoreIndex(99, 3)).toBe(3);
  });
});
