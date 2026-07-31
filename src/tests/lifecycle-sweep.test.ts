/**
 * Orchestration-level tests for lifecycle engine helpers and reconciliation utilities.
 */
import { describe, expect, it } from "vitest";
import {
  applyEvaluationPatch,
  shouldExecuteClose,
  shouldExecuteSleep,
  shouldRecordWouldClose,
} from "../background/lifecycle-engine.ts";
import { cancelAllPendingClosures } from "../background/reconciliation-service.ts";
import { enabledSettings, makeTab, BASE_NOW } from "./lifecycle/fixtures.ts";
import { MINUTE } from "../shared/time.ts";

describe("lifecycle-engine", () => {
  it("applyEvaluationPatch schedules pending close with grace", () => {
    const tab = makeTab();
    const settings = enabledSettings({ closeGraceMinutes: 10 });
    const result = {
      actions: ["SCHEDULE_CLOSE"] as const,
      reason: "threshold",
      pendingCloseAt: BASE_NOW + 10 * MINUTE,
    };
    const patched = applyEvaluationPatch(tab, { ...result, actions: [...result.actions] }, settings, BASE_NOW);
    expect(patched.pendingCloseAt).toBe(BASE_NOW + 10 * MINUTE);
    expect(patched.pendingCloseScheduledAt).toBe(BASE_NOW);
  });

  it("applyEvaluationPatch clears pending fields on cancel", () => {
    const tab = makeTab({
      pendingCloseAt: BASE_NOW + 5 * MINUTE,
      pendingCloseScheduledAt: BASE_NOW,
      pendingCloseReason: "old",
    });
    const patched = applyEvaluationPatch(
      tab,
      { actions: ["CANCEL_CLOSE"], reason: "paused" },
      enabledSettings(),
      BASE_NOW,
    );
    expect(patched.pendingCloseAt).toBeUndefined();
  });

  it("flags executable sleep/close/would-close correctly", () => {
    expect(shouldExecuteSleep({ actions: ["SLEEP"], reason: "" })).toBe(true);
    expect(shouldExecuteClose({ actions: ["CLOSE"], reason: "" })).toBe(true);
    expect(shouldRecordWouldClose({ actions: ["NONE"], reason: "", wouldClose: true })).toBe(
      true,
    );
  });
});

describe("cancelAllPendingClosures", () => {
  it("clears pending-close fields on all records", () => {
    const records = new Map([
      [1, makeTab({ tabId: 1, pendingCloseAt: BASE_NOW + MINUTE })],
      [2, makeTab({ tabId: 2 })],
    ]);
    const cancelled = cancelAllPendingClosures(records);
    expect(cancelled).toBe(1);
    expect(records.get(1)?.pendingCloseAt).toBeUndefined();
  });
});
