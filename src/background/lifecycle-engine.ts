/**
 * Converts pure evaluation results into tab-record patches.
 */
import type { EvaluationResult } from "../shared/lifecycle.ts";
import type { ExtensionSettings, ManagedTabRecord } from "../shared/types.ts";
import { minutesToMs } from "../shared/time.ts";

export interface TabEvaluation {
  tabId: number;
  result: EvaluationResult;
  record: ManagedTabRecord;
}

export function applyEvaluationPatch(
  record: ManagedTabRecord,
  result: EvaluationResult,
  settings: ExtensionSettings,
  now: number,
): ManagedTabRecord {
  let next = { ...record };

  for (const action of result.actions) {
    if (action === "CANCEL_CLOSE") {
      next = {
        ...next,
        pendingCloseAt: undefined,
        pendingCloseScheduledAt: undefined,
        pendingCloseReason: undefined,
        pendingCloseRuleMinutes: undefined,
      };
    } else if (action === "SCHEDULE_CLOSE") {
      next = {
        ...next,
        pendingCloseAt: result.pendingCloseAt ?? now + minutesToMs(settings.closeGraceMinutes),
        pendingCloseScheduledAt: now,
        pendingCloseReason: result.reason,
        pendingCloseRuleMinutes: settings.closeAfterMinutes,
      };
    }
  }

  return next;
}

export function shouldExecuteSleep(result: EvaluationResult): boolean {
  return result.actions.includes("SLEEP");
}

export function shouldExecuteClose(result: EvaluationResult): boolean {
  return result.actions.includes("CLOSE");
}

export function shouldRecordWouldClose(result: EvaluationResult): boolean {
  return result.wouldClose === true;
}
