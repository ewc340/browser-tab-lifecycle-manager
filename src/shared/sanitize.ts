/**
 * Page titles and URLs are attacker-controlled strings. React escapes them on render,
 * but escaping alone does not stop a title from using bidirectional-override characters
 * to visually impersonate another domain in the tab list, and it does not stop a
 * multi-megabyte title from bloating storage. Both are handled here, before storage.
 */
import { PRODUCT_SHORT_NAME } from "./product.ts";

const MAX_TITLE_LENGTH = 300;
const MAX_URL_LENGTH = 2048;

/**
 * Bidi controls (LRE/RLE/PDF/LRO/RLO and the isolate family) plus other invisible
 * formatting characters that can reorder displayed text.
 */
const BIDI_AND_INVISIBLE = /[\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/g;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F]/g;

export function stripUnsafeCharacters(value: string): string {
  return value.replace(BIDI_AND_INVISIBLE, "").replace(CONTROL_CHARACTERS, " ");
}

export function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}\u2026`;
}

/** Normalizes a tab title for storage and display. */
export function sanitizeTitle(title: string | undefined, fallback = "Untitled"): string {
  const cleaned = stripUnsafeCharacters(title ?? "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > 0 ? truncate(cleaned, MAX_TITLE_LENGTH) : fallback;
}

export function sanitizeUrl(url: string | undefined): string {
  return truncate(stripUnsafeCharacters(url ?? "").trim(), MAX_URL_LENGTH);
}

/** Hostname, or "" when the URL has none (about:blank, data:, malformed). */
export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/**
 * Hostname for display, with "www." dropped. Punycode is intentionally left as-is: an
 * `xn--` prefix is a useful signal that a domain is not what it appears to be, and
 * decoding it would hide homograph spoofing rather than reveal it.
 */
export function displayHost(url: string): string {
  const host = hostnameOf(url);
  if (host.length > 0) return host.replace(/^www\./, "");

  const scheme = /^([a-z-]+):/i.exec(url)?.[1];
  return scheme ? `${scheme.toLowerCase()}:` : "";
}

/**
 * Like `displayHost`, but gives friendly labels to chrome-extension:// URLs.
 * - A URL from this extension (matched by `ownExtensionId`) → `PRODUCT_SHORT_NAME`.
 * - Any other extension URL → `"Extension"`.
 * This is pure: it never calls `chrome.*`; the caller supplies the extension id.
 */
export function displayHostForTab(url: string, ownExtensionId?: string): string {
  if (url.startsWith("chrome-extension://")) {
    try {
      const { hostname } = new URL(url);
      if (ownExtensionId && hostname === ownExtensionId) return PRODUCT_SHORT_NAME;
    } catch {
      // malformed URL — fall through to generic label
    }
    return "Extension";
  }
  return displayHost(url);
}
