import { describe, expect, it } from "vitest";
import { extractEntityKeys, primaryEntityKey } from "../shared/entity-keys.ts";

describe("extractEntityKeys", () => {
  it("extracts Jira-style keys from title", () => {
    const keys = extractEntityKeys("https://example.com/", "Fix PROJ-412 billing bug");
    expect(keys).toContain("PROJ-412");
  });

  it("extracts github org/repo", () => {
    const keys = extractEntityKeys("https://github.com/org/payments-api/pull/882", "PR");
    expect(keys).toContain("github:org/payments-api");
  });

  it("extracts google doc id", () => {
    const keys = extractEntityKeys(
      "https://docs.google.com/document/d/abc123XYZ/edit",
      "Doc",
    );
    expect(keys).toContain("gdoc:abc123XYZ");
  });

  it("returns sorted unique keys", () => {
    const keys = extractEntityKeys(
      "https://jira.example.com/browse/PROJ-99",
      "PROJ-99 summary",
    );
    expect(keys.filter((k: string) => k === "PROJ-99").length).toBe(1);
  });
});

describe("primaryEntityKey", () => {
  it("returns first sorted key", () => {
    expect(primaryEntityKey(["B-2", "A-1"])).toBe("A-1");
  });

  it("returns undefined when empty", () => {
    expect(primaryEntityKey([])).toBeUndefined();
  });
});
