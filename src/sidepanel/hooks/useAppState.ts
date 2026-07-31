/**
 * Fetches and keeps AppState fresh.
 *
 * Triggers: mount, visibilitychange (when becoming visible), any broadcast
 * from the service worker, and a 60-second safety timer.
 *
 * Time labels (e.g. "3h ago") need to re-render every 30 s without hitting the
 * service worker. useTick() returns the current timestamp updated on interval
 * so components re-render on schedule without a fetch.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "../../shared/types.ts";
import { isBroadcastEnvelope } from "../../shared/messages.ts";
import { useMessaging } from "./useMessaging.ts";

interface UseAppStateResult {
  state: AppState | null;
  loading: boolean;
  error: string | null;
  versionSkew: boolean;
  refresh: () => void;
}

export function useAppState(): UseAppStateResult {
  const { send } = useMessaging();
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versionSkew, setVersionSkew] = useState(false);

  // Boot version is tracked in a ref: it is read and written only inside the
  // async fetch callback (not during render), which satisfies react-hooks/refs.
  const bootVersionRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);

  const refresh = useCallback(() => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setLoading(true);

    send({ type: "GET_APP_STATE" })
      .then((appState) => {
        // Version-skew detection happens inside the async callback, not in
        // render or synchronously in an effect, satisfying react-hooks rules.
        if (bootVersionRef.current === null) {
          bootVersionRef.current = appState.extensionVersion;
        } else if (bootVersionRef.current !== appState.extensionVersion) {
          setVersionSkew(true);
        }
        setState(appState);
        setError(null);
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load state.");
      })
      .finally(() => {
        setLoading(false);
        fetchingRef.current = false;
      });
  }, [send]);

  // Fetch on mount.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-fetch when the panel becomes visible after being hidden.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh]);

  // Re-fetch on broadcasts from the service worker.
  useEffect(() => {
    const handleMessage = (msg: unknown) => {
      if (!isBroadcastEnvelope(msg)) return;
      const { type } = msg.broadcast;
      if (type === "APP_STATE_CHANGED" || type === "SETTINGS_CHANGED") {
        refresh();
      }
    };
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [refresh]);

  // 60-second safety timer: ensures the panel stays reasonably fresh even if
  // broadcasts are lost due to service worker termination.
  useEffect(() => {
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { state, loading, error, versionSkew, refresh };
}

/**
 * Returns the current timestamp in milliseconds, updated every `intervalMs`.
 * Components that render relative times (e.g. "3h") consume this hook so they
 * re-render on schedule without triggering a service-worker fetch.
 *
 * Date.now() is called inside the effect/initializer (not in render body) to
 * stay compatible with the react-hooks/purity rule.
 */
export function useTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
