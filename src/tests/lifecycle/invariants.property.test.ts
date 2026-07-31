/**
 * fast-check property tests for lifecycle safety invariants (review F2).
 */
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { evaluateTab } from "../../shared/lifecycle.ts";
import { baseContext, enabledSettings, makeTab, BASE_NOW } from "./fixtures.ts";
import { MINUTE } from "../../shared/time.ts";

const DESTRUCTIVE = new Set(["SLEEP", "CLOSE", "SCHEDULE_CLOSE"]);

function hasDestructive(actions: readonly string[]): boolean {
  return actions.some((action) => DESTRUCTIVE.has(action));
}

describe("lifecycle safety invariants (property)", () => {
  it("active tabs never receive destructive actions", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (inactiveMinutes) => {
        const tab = makeTab({ active: true, lastActivatedAt: BASE_NOW - inactiveMinutes * MINUTE });
        const result = evaluateTab(tab, enabledSettings(), baseContext());
        expect(hasDestructive(result.actions)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("pinned tabs never receive destructive actions", () => {
    fc.assert(
      fc.property(fc.boolean(), (active) => {
        const tab = makeTab({ pinned: true, active });
        const result = evaluateTab(tab, enabledSettings(), baseContext());
        expect(hasDestructive(result.actions)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("audible tabs never receive destructive actions", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000 }), (inactiveMinutes) => {
        const tab = makeTab({
          audible: true,
          lastActivatedAt: BASE_NOW - inactiveMinutes * MINUTE,
        });
        const result = evaluateTab(tab, enabledSettings(), baseContext());
        expect(hasDestructive(result.actions)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("locked tabs never schedule or execute close", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20_000 }), (inactiveMinutes) => {
        const tab = makeTab({
          closeLocked: true,
          lastActivatedAt: BASE_NOW - inactiveMinutes * MINUTE,
          pendingCloseAt: BASE_NOW - MINUTE,
        });
        const result = evaluateTab(tab, enabledSettings(), baseContext());
        expect(result.actions.includes("CLOSE")).toBe(false);
        expect(result.actions.includes("SCHEDULE_CLOSE")).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("automation paused only allows NONE or CANCEL_CLOSE", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20_000 }), (inactiveMinutes) => {
        const tab = makeTab({
          lastActivatedAt: BASE_NOW - inactiveMinutes * MINUTE,
          pendingCloseAt: BASE_NOW + 5 * MINUTE,
        });
        const result = evaluateTab(
          tab,
          enabledSettings({ automationPaused: true }),
          baseContext(),
        );
        for (const action of result.actions) {
          expect(["NONE", "CANCEL_CLOSE"]).toContain(action);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("onboarding incomplete only allows NONE", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20_000 }), (inactiveMinutes) => {
        const tab = makeTab({ lastActivatedAt: BASE_NOW - inactiveMinutes * MINUTE });
        const result = evaluateTab(
          tab,
          enabledSettings({ onboardingCompleted: false }),
          baseContext(),
        );
        expect(result.actions).toEqual(["NONE"]);
      }),
      { numRuns: 200 },
    );
  });

  it("unmanageable tabs receive no destructive actions", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 20_000 }), (inactiveMinutes) => {
        const tab = makeTab({
          canDiscard: false,
          canClose: false,
          unavailableReason: "PRIVILEGED_PAGE",
          lastActivatedAt: BASE_NOW - inactiveMinutes * MINUTE,
        });
        const result = evaluateTab(tab, enabledSettings(), baseContext());
        expect(hasDestructive(result.actions)).toBe(false);
        expect(result.actions.includes("CLOSE")).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("CLOSE only when pendingCloseAt is in the past", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -10_000, max: 10_000 }),
        (pendingOffsetMs) => {
          const now = BASE_NOW;
          const tab = makeTab({
            lastActivatedAt: now - 200 * MINUTE,
            pendingCloseAt: now + pendingOffsetMs,
            pendingCloseScheduledAt: now - 30 * MINUTE,
          });
          const result = evaluateTab(tab, enabledSettings(), { ...baseContext(), now });
          if (result.actions.includes("CLOSE")) {
            expect(tab.pendingCloseAt).toBeDefined();
            expect(tab.pendingCloseAt!).toBeLessThanOrEqual(now);
          }
        },
      ),
      { numRuns: 300 },
    );
  });
});
