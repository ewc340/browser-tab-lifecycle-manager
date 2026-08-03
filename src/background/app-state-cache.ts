/**
 * In-memory AppState snapshot for fast panel reads.
 *
 * Tab records in chrome.storage.session are the source of truth; this cache
 * avoids recomputing TabViews on every GET_APP_STATE when the panel reopens.
 */
import type { AppState } from "../shared/types.ts";

let cache: { state: AppState; at: number } | null = null;

export function getCachedAppState(maxAgeMs: number): AppState | null {
  if (cache === null) return null;
  if (Date.now() - cache.at > maxAgeMs) return null;
  return cache.state;
}

export function setCachedAppState(state: AppState): void {
  cache = { state, at: Date.now() };
}

export function invalidateAppStateCache(): void {
  cache = null;
}
