import { describe, expect, it } from "vitest";
import type { DiagnosticEntry } from "../shared/types.ts";
import {
  appendDiagnosticEntry,
  DIAGNOSTIC_CAP,
  formatDiagnosticReport,
  redactDiagnosticUrl,
} from "../shared/diagnostics.ts";

describe("diagnostics", () => {
  it("caps the ring buffer at 200 entries", () => {
    let entries: DiagnosticEntry[] = [];
    for (let i = 0; i < DIAGNOSTIC_CAP + 5; i++) {
      entries = appendDiagnosticEntry(entries, { code: "TEST", message: `e${i}` });
    }
    expect(entries.length).toBe(DIAGNOSTIC_CAP);
    expect(entries[0]?.message).toBe(`e${DIAGNOSTIC_CAP + 4}`);
    expect(entries[entries.length - 1]?.message).toBe("e5");
  });

  it("redacts URLs to hostnames only", () => {
    expect(redactDiagnosticUrl("https://mail.google.com/inbox/secret")).toBe("mail.google.com");
  });

  it("formats a report without raw URLs", () => {
    const text = formatDiagnosticReport(
      [{ at: 1_000, code: "TAB_DISCARD_FAILED", message: "discard failed", host: "example.com" }],
      "0.1.0",
    );
    expect(text).toContain("example.com");
    expect(text).not.toContain("https://");
  });
});
