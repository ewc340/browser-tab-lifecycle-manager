/**
 * Ordered close-with-recovery steps — pure orchestration contract (M3).
 *
 * Recovery must be persisted before tabs.remove; the activity event and
 * activityEventId back-reference are written after removal.
 */
export type CloseWithRecoveryStep = "recovery" | "remove" | "activity" | "link";

export interface CloseWithRecoveryResult {
  recoveryId: string;
  activityEventId: string;
}

export async function executeCloseWithRecovery(deps: {
  createRecovery: () => Promise<{ id: string }>;
  removeTab: () => Promise<void>;
  appendActivity: (recoveryId: string) => Promise<{ id: string }>;
  linkActivity: (recoveryId: string, activityEventId: string) => Promise<void>;
  onStep?: (step: CloseWithRecoveryStep) => void;
}): Promise<CloseWithRecoveryResult> {
  deps.onStep?.("recovery");
  const recovery = await deps.createRecovery();

  deps.onStep?.("remove");
  await deps.removeTab();

  deps.onStep?.("activity");
  const event = await deps.appendActivity(recovery.id);

  deps.onStep?.("link");
  await deps.linkActivity(recovery.id, event.id);

  return { recoveryId: recovery.id, activityEventId: event.id };
}
