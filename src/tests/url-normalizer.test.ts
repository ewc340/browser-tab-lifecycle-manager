import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../shared/url-normalizer.ts";

describe("normalizeUrl", () => {
  it("is deterministic: same input produces same output twice", () => {
    const url = "https://example.com/path?b=2&a=1#section";
    expect(normalizeUrl(url)).toBe(normalizeUrl(url));
  });

  it("sorts query parameters alphabetically", () => {
    expect(normalizeUrl("https://example.com/?z=3&a=1&m=2")).toBe(
      "https://example.com/?a=1&m=2&z=3",
    );
  });

  it("sorts query params with the same key by value", () => {
    expect(normalizeUrl("https://example.com/?a=b&a=a")).toBe(
      "https://example.com/?a=a&a=b",
    );
  });

  it("removes default HTTP port 80", () => {
    expect(normalizeUrl("http://example.com:80/path")).toBe("http://example.com/path");
  });

  it("removes default HTTPS port 443", () => {
    expect(normalizeUrl("https://example.com:443/path")).toBe("https://example.com/path");
  });

  it("preserves non-default ports", () => {
    expect(normalizeUrl("https://example.com:8443/path")).toBe("https://example.com:8443/path");
  });

  it("lowercases the scheme", () => {
    expect(normalizeUrl("HTTPS://example.com/")).toBe("https://example.com/");
  });

  it("lowercases the host", () => {
    expect(normalizeUrl("https://EXAMPLE.COM/")).toBe("https://example.com/");
  });

  it("preserves path casing", () => {
    expect(normalizeUrl("https://example.com/Path/To/Resource")).toBe(
      "https://example.com/Path/To/Resource",
    );
  });

  it("drops an empty query string (bare ?)", () => {
    expect(normalizeUrl("https://example.com/path?")).toBe("https://example.com/path");
  });

  it("preserves a non-empty fragment", () => {
    expect(normalizeUrl("https://example.com/page#section")).toBe(
      "https://example.com/page#section",
    );
  });

  it("drops a bare # with no fragment value", () => {
    expect(normalizeUrl("https://example.com/page#")).toBe("https://example.com/page");
  });

  it("strips credentials (username and password)", () => {
    expect(normalizeUrl("https://user:pass@example.com/")).toBe("https://example.com/");
  });

  it("handles a non-parseable input without throwing", () => {
    const result = normalizeUrl("not a valid url !!!");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns empty string for empty input", () => {
    expect(normalizeUrl("")).toBe("");
  });

  it("returns empty string for whitespace-only input", () => {
    expect(normalizeUrl("   ")).toBe("");
  });

  it("handles about:blank (non-hierarchical scheme)", () => {
    const result = normalizeUrl("about:blank");
    expect(typeof result).toBe("string");
    expect(result.includes("about")).toBe(true);
  });

  it("lowercases non-parseable input for determinism", () => {
    expect(normalizeUrl("ABOUT:BLANK")).toBe("about:blank");
  });
});
