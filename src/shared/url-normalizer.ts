/**
 * URL normalization for identity comparison only (PRD §20).
 *
 * The normalized form is what the durable activity ledger is keyed by, and it is what a
 * future duplicate-detection feature will compare. It must never be used to navigate or
 * to restore a tab: some servers are sensitive to query-parameter order, so only the
 * raw URL is safe to reopen.
 *
 * Rules: lowercase the scheme and host, drop default ports, sort query parameters,
 * drop an empty query or fragment, preserve path casing, preserve every parameter, and
 * preserve real fragments. Tracking-parameter removal is deliberately not done here; it
 * belongs behind its own feature flag in a later version.
 */

/** Credentials are stripped: a normalized URL becomes a storage key, and a password must not. */
export function normalizeUrl(rawUrl: string): string {
  const trimmed = rawUrl.trim();
  if (trimmed.length === 0) return "";

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // about:blank, malformed URLs, and anything else non-parseable: lowercase only, so
    // the result is still deterministic.
    return trimmed.toLowerCase();
  }

  const scheme = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  // The URL parser already removes a port that is the default for the scheme.
  const port = parsed.port ? `:${parsed.port}` : "";

  const params = [...parsed.searchParams.entries()].sort(([aKey, aValue], [bKey, bValue]) =>
    aKey === bKey ? compare(aValue, bValue) : compare(aKey, bKey),
  );
  const query = params.length > 0 ? `?${new URLSearchParams(params).toString()}` : "";

  const fragment = parsed.hash === "#" ? "" : parsed.hash;

  // Opaque schemes (mailto:, data:, javascript:) have no host and an empty pathname in
  // some engines; fall back to the raw remainder so nothing is silently dropped.
  if (host.length === 0) {
    return `${scheme}${parsed.pathname}${query}${fragment}`.toLowerCase();
  }

  return `${scheme}//${host}${port}${parsed.pathname}${query}${fragment}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
