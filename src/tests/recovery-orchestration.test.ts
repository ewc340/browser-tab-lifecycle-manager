import { describe, expect, it, vi } from "vitest";
import { executeCloseWithRecovery } from "../shared/recovery-close-flow.ts";

describe("recovery close orchestration", () => {
  it("persists recovery before remove, then activity and link", async () => {
    const order: string[] = [];

    const result = await executeCloseWithRecovery({
      createRecovery: () => {
        order.push("recovery");
        return Promise.resolve({ id: "rec-1" });
      },
      removeTab: () => {
        order.push("remove");
        return Promise.resolve();
      },
      appendActivity: (recoveryId: string) => {
        order.push(`activity:${recoveryId}`);
        return Promise.resolve({ id: "evt-1" });
      },
      linkActivity: (recoveryId: string, activityEventId: string) => {
        order.push(`link:${recoveryId}:${activityEventId}`);
        return Promise.resolve();
      },
      onStep: (step: string) => order.push(step),
    });

    expect(result).toEqual({ recoveryId: "rec-1", activityEventId: "evt-1" });
    expect(order.indexOf("recovery")).toBeLessThan(order.indexOf("remove"));
    expect(order.indexOf("remove")).toBeLessThan(order.indexOf("activity:rec-1"));
    expect(order).toContain("link:rec-1:evt-1");
  });

  it("does not append activity when remove fails", async () => {
    const appendActivity = vi.fn();
    await expect(
      executeCloseWithRecovery({
        createRecovery: () => Promise.resolve({ id: "rec-1" }),
        removeTab: () => Promise.reject(new Error("remove failed")),
        appendActivity,
        linkActivity: () => Promise.resolve(),
      }),
    ).rejects.toThrow("remove failed");
    expect(appendActivity).not.toHaveBeenCalled();
  });
});
