/**
 * Extract stable entity keys from URLs and titles — no page content, regex only.
 */

const ISSUE_KEY_PATTERN = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;

/** Query param names allowed for key extraction (avoid sensitive tokens). */
const ALLOWED_QUERY_KEYS = new Set([
  "id",
  "issue",
  "doc",
  "document",
  "page",
  "project",
  "key",
  "ticket",
]);

function addIssueKeysFromText(text: string, keys: Set<string>): void {
  for (const match of text.matchAll(ISSUE_KEY_PATTERN)) {
    const key = match[0];
    keys.add(key);
  }
}

function tryParseUrl(rawUrl: string): URL | undefined {
  try {
    return new URL(rawUrl);
  } catch {
    return undefined;
  }
}

function extractFromUrl(parsed: URL, keys: Set<string>): void {
  const host = parsed.hostname.toLowerCase();

  if (host === "github.com" || host === "www.github.com") {
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      keys.add(`github:${parts[0]}/${parts[1]}`);
    }
  }

  if (host === "gitlab.com" || host.endsWith(".gitlab.io")) {
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) {
      keys.add(`gitlab:${parts[0]}/${parts[1]}`);
    }
  }

  const docMatch = parsed.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
  if (docMatch !== null && docMatch[1] !== undefined) {
    keys.add(`gdoc:${docMatch[1]}`);
  }

  const notionMatch = parsed.pathname.match(/\/([a-f0-9]{32})/i);
  if (host.includes("notion.so") && notionMatch !== null && notionMatch[1] !== undefined) {
    keys.add(`notion:${notionMatch[1].slice(0, 16)}`);
  }

  for (const [param, value] of parsed.searchParams.entries()) {
    if (!ALLOWED_QUERY_KEYS.has(param.toLowerCase())) continue;
    const trimmed = value.trim();
    if (trimmed.length >= 2 && trimmed.length <= 64 && /^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      keys.add(`param:${param.toLowerCase()}=${trimmed}`);
    }
  }
}

/**
 * Returns sorted, deduplicated entity keys for clustering and labels.
 */
export function extractEntityKeys(url: string, title: string): string[] {
  const keys = new Set<string>();

  addIssueKeysFromText(title, keys);

  const parsed = tryParseUrl(url);
  if (parsed !== undefined) {
    addIssueKeysFromText(parsed.pathname, keys);
    extractFromUrl(parsed, keys);
  }

  return [...keys].sort();
}

export function primaryEntityKey(keys: readonly string[]): string | undefined {
  if (keys.length === 0) return undefined;
  const sorted = [...keys].sort();
  return sorted[0];
}
