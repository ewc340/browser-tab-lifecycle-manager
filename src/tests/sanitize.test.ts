import { describe, expect, it } from "vitest";
import {
  displayHost,
  displayHostForTab,
  sanitizeTitle,
  sanitizeUrl,
  stripUnsafeCharacters,
} from "../shared/sanitize.ts";
import { PRODUCT_SHORT_NAME } from "../shared/product.ts";

// ── stripUnsafeCharacters ─────────────────────────────────────────────────────

describe("stripUnsafeCharacters", () => {
  it("strips bidi override characters (LRO U+202D)", () => {
    const input = "Hello\u202DWorld";
    expect(stripUnsafeCharacters(input)).toBe("HelloWorld");
  });

  it("strips zero-width space (U+200B)", () => {
    const input = "Hello\u200BWorld";
    expect(stripUnsafeCharacters(input)).toBe("HelloWorld");
  });

  it("strips right-to-left mark (U+200F)", () => {
    expect(stripUnsafeCharacters("A\u200FB")).toBe("AB");
  });

  it("replaces control characters with space", () => {
    expect(stripUnsafeCharacters("Hello\u0000World")).toBe("Hello World");
  });

  it("replaces tab character (U+0009) with space", () => {
    expect(stripUnsafeCharacters("A\tB")).toBe("A B");
  });

  it("leaves normal ASCII text unchanged", () => {
    expect(stripUnsafeCharacters("Hello, World!")).toBe("Hello, World!");
  });

  it("strips BOM (U+FEFF)", () => {
    expect(stripUnsafeCharacters("\uFEFFHello")).toBe("Hello");
  });
});

// ── sanitizeTitle ─────────────────────────────────────────────────────────────

describe("sanitizeTitle", () => {
  it("collapses multiple spaces into one", () => {
    expect(sanitizeTitle("Hello   World")).toBe("Hello World");
  });

  it("trims leading and trailing whitespace", () => {
    expect(sanitizeTitle("  Hello  ")).toBe("Hello");
  });

  it("truncates a title longer than 300 characters", () => {
    const long = "a".repeat(400);
    const result = sanitizeTitle(long);
    expect(result.length).toBeLessThanOrEqual(300);
    expect(result.endsWith("…")).toBe(true);
  });

  it("strips bidi characters before truncation", () => {
    const withBidi = "Hello\u200BWorld";
    expect(sanitizeTitle(withBidi)).toBe("HelloWorld");
  });

  it("falls back to 'Untitled' for an empty title", () => {
    expect(sanitizeTitle("")).toBe("Untitled");
  });

  it("falls back to 'Untitled' for undefined", () => {
    expect(sanitizeTitle(undefined)).toBe("Untitled");
  });

  it("falls back to 'Untitled' for whitespace-only title", () => {
    expect(sanitizeTitle("   ")).toBe("Untitled");
  });

  it("accepts a custom fallback", () => {
    expect(sanitizeTitle("", "No title")).toBe("No title");
  });

  it("preserves a normal title", () => {
    expect(sanitizeTitle("My Tab Title")).toBe("My Tab Title");
  });
});

// ── sanitizeUrl ───────────────────────────────────────────────────────────────

describe("sanitizeUrl", () => {
  it("returns the URL unchanged when it is short", () => {
    expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
  });

  it("strips bidi characters from URLs", () => {
    expect(sanitizeUrl("https://example\u200B.com")).toBe("https://example.com");
  });

  it("truncates URLs longer than 2048 characters", () => {
    const long = "https://example.com/" + "a".repeat(2100);
    const result = sanitizeUrl(long);
    expect(result.length).toBeLessThanOrEqual(2048);
  });

  it("returns empty string for undefined", () => {
    expect(sanitizeUrl(undefined)).toBe("");
  });
});

// ── displayHost ───────────────────────────────────────────────────────────────

describe("displayHost", () => {
  it("returns the hostname for a normal URL", () => {
    expect(displayHost("https://example.com/path")).toBe("example.com");
  });

  it("drops www. prefix", () => {
    expect(displayHost("https://www.example.com/")).toBe("example.com");
  });

  it("does not drop www when it is not a prefix (e.g. wwwexample.com)", () => {
    expect(displayHost("https://wwwexample.com/")).toBe("wwwexample.com");
  });

  it("returns scheme: for about:blank", () => {
    expect(displayHost("about:blank")).toBe("about:");
  });

  it("returns scheme: for data: URL", () => {
    expect(displayHost("data:text/html,<h1>hi</h1>")).toBe("data:");
  });

  it("returns empty string for an empty URL", () => {
    expect(displayHost("")).toBe("");
  });

  it("returns the subdomain correctly", () => {
    expect(displayHost("https://sub.example.com/")).toBe("sub.example.com");
  });
});

// ── displayHostForTab ─────────────────────────────────────────────────────────

describe("displayHostForTab", () => {
  const ownId = "abcdefghijklmnopqrstuvwxyz123456";

  it("returns PRODUCT_SHORT_NAME for a chrome-extension:// URL belonging to this extension", () => {
    expect(displayHostForTab(`chrome-extension://${ownId}/sidepanel.html`, ownId)).toBe(PRODUCT_SHORT_NAME);
  });

  it("returns 'Extension' for a chrome-extension:// URL from a different extension", () => {
    expect(displayHostForTab("chrome-extension://other-ext-id-here/index.html", ownId)).toBe("Extension");
  });

  it("returns 'Extension' when no ownExtensionId is provided", () => {
    expect(displayHostForTab(`chrome-extension://${ownId}/page.html`)).toBe("Extension");
  });

  it("falls back to displayHost behaviour for normal https:// URLs", () => {
    expect(displayHostForTab("https://example.com/path", ownId)).toBe("example.com");
  });

  it("falls back to displayHost behaviour for about:blank", () => {
    expect(displayHostForTab("about:blank", ownId)).toBe("about:");
  });
});
