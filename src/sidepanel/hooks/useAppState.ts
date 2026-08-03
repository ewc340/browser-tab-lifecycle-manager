/**
 * Fetches and keeps AppState fresh.
 *
 * Triggers: mount, visibilitychange (when becoming visible), any broadcast
 * from the service worker, and a 60-second safety timer.
 *
 * On reopen, shows the last snapshot from chrome.storage.session immediately
 * while a prefer-cache fetch updates in the background.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppState } from "../../shared/types.ts";
import { isBroadcastEnvelope } from "../../shared/messages.ts";
import { useMessaging } from "./useMessaging.ts";
import { readPanelAppStateCache, writePanelAppStateCache } from "./panel-app-state-cache.ts";

interface UseAppStateResult {
  state: AppState | null;
  loading: boolean;
  error: string | null;
  versionSkew: boolean;
  refresh: (options?: { force?: boolean; preferCache?: boolean }) => void;
}

export function useAppState(): UseAppStateResult {
  const { send } = useMessaging();
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [versionSkew, setVersionSkew] = useState(false);

  const bootVersionRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);
  const hasStateRef = useRef(false);

  const applyAppState = useCallback((appState: AppState) => {
    if (bootVersionRef.current === null) {
      bootVersionRef.current = appState.extensionVersion;
    } else if (bootVersionRef.current !== appState.extensionVersion) {
      setVersionSkew(true);
    }
    hasStateRef.current = true;
    setState(appState);
    setError(null);
    void writePanelAppStateCache(appState);
  }, []);

  const refresh = useCallback(
    (options?: { force?: boolean; preferCache?: boolean }) => {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
      if (!hasStateRef.current) setLoading(true);

      const force = options?.force ?? false;
      const preferCache = options?.preferCache ?? false;
      send({
        type: "GET_APP_STATE",
        preferCache,
        forceRefresh: force,
      })
        .then(applyAppState)
        .catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Failed to load state.");
        })
        .finally(() => {
          setLoading(false);
          fetchingRef.current = false;
        });
    },
    [applyAppState, send],
  );

  useEffect(() => {
    let cancelled = false;

    void readPanelAppStateCache().then((cached) => {
      if (cancelled) return;
      if (cached !== null) {
        applyAppState(cached);
        setLoading(false);
      }
      refresh({ preferCache: true });
    });

    return () => {
      cancelled = true;
    };
  }, [applyAppState, refresh]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refresh]);

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

  useEffect(() => {
    const id = setInterval(() => refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { state, loading, error, versionSkew, refresh };
}

/**
 * Returns the current timestamp in milliseconds, updated every `intervalMs`.
 */
export function useTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
