/**
 * Auto labels for threads from entity keys and visit metadata.
 */
import { formatDate } from "./time.ts";

export function buildThreadAutoLabel(
  seedKey: string | undefined,
  entityKeys: readonly string[],
  visitCount: number,
  lastSeenAt: number,
): string {
  const key = seedKey ?? entityKeys[0] ?? "misc";
  const date = formatDate(lastSeenAt);
  return `${key} · ${visitCount} visit${visitCount === 1 ? "" : "s"} · ${date}`;
}
