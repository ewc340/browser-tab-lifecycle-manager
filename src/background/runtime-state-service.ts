/**
 * Loads and saves the RuntimeState from local storage.
 *
 * RuntimeState is durable: it survives browser restarts so we can detect
 * downtime (gap between lastSweepCompletedAt and browserStartedAt) and present
 * the correct "what's new" version.
 */
import type { RuntimeState } from "../shared/types.ts";
import { getLocal, setLocal, LOCAL_KEY_RUNTIME_STATE } from "./storage.ts";

function makeInitialState(): RuntimeState {
  const { version } = chrome.runtime.getManifest();
  return {
    browserStartedAt: Date.now(),
    lastSweepCompletedAt: 0,
    lastRetentionRunAt: 0,
    reportOnlyUntil: 0,
    lastKnownVersion: version,
    whatsNewVersion: version,
    whatsNewSeenVersion: version,
  };
}

export async function loadRuntimeState(): Promise<RuntimeState> {
  const stored = await getLocal<Partial<RuntimeState> | null>(LOCAL_KEY_RUNTIME_STATE, null);
  if (stored === null) {
    const initial = makeInitialState();
    await setLocal({ [LOCAL_KEY_RUNTIME_STATE]: initial });
    return initial;
  }
  // Merge with defaults so new fields added in future milestones are initialised.
  return { ...makeInitialState(), ...stored };
}

export async function saveRuntimeState(state: RuntimeState): Promise<void> {
  await setLocal({ [LOCAL_KEY_RUNTIME_STATE]: state });
}
