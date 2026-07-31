/**
 * Daily retention maintenance and orphan recovery repair (M3).
 */
import { DAY } from "../shared/time.ts";
import { loadSettings } from "./settings-service.ts";
import { loadRuntimeState, saveRuntimeState } from "./runtime-state-service.ts";
import { enforceActivityRetention } from "./activity-service.ts";
import { enforceRecoveryRetention, repairOrphanedRecoveries } from "./recovery-service.ts";
import { appendActivityEvent } from "./activity-service.ts";

export async function runRetentionMaintenance(now: number): Promise<void> {
  const runtime = await loadRuntimeState();
  if (now - runtime.lastRetentionRunAt < DAY) {
    await repairOrphanedRecoveries();
    return;
  }

  const settings = await loadSettings();
  const activityRemoved = await enforceActivityRetention(
    settings.maximumActivityEvents,
    settings.activityRetentionDays,
  );
  const recoveryRemoved = await enforceRecoveryRetention();
  const orphansRepaired = await repairOrphanedRecoveries();

  if (activityRemoved > 0 || recoveryRemoved > 0 || orphansRepaired > 0) {
    await appendActivityEvent({
      type: "MAINTENANCE",
      source: "AUTOMATIC_MAINTENANCE",
      message: `Retention: removed ${activityRemoved} activity event(s), ${recoveryRemoved} recovery record(s); repaired ${orphansRepaired} orphan(s).`,
      tabs: [],
      reversible: false,
      metadata: { activityRemoved, recoveryRemoved, orphansRepaired },
    });
  }

  runtime.lastRetentionRunAt = now;
  await saveRuntimeState(runtime);
}
