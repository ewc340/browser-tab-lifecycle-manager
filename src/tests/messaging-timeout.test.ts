import { describe, expect, it } from "vitest";
import { withTimeout } from "../shared/messaging-timeout.ts";

describe("withTimeout", () => {
  it("resolves when the promise settles in time", async () => {
    await expect(withTimeout(Promise.resolve("ok"), 100, "test")).resolves.toBe("ok");
  });

  it("rejects when the promise exceeds the deadline", async () => {
    await expect(
      withTimeout(new Promise<string>(() => {}), 50, "GET_APP_STATE"),
    ).rejects.toThrow(/GET_APP_STATE timed out after 0s/);
  });
});
