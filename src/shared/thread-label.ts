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

/** Label for keyless session threads — leading hosts + visit count. */
export function buildSessionThreadLabel(
  hosts: readonly string[],
  visitCount: number,
  lastSeenAt: number,
): string {
  const unique = [...new Set(hosts.filter((h) => h.length > 0))].sort();
  const hostPart =
    unique.length === 0
      ? "misc"
      : unique.length <= 2
        ? unique.join(", ")
        : `${unique[0]}, ${unique[1]} +${unique.length - 2}`;
  const date = formatDate(lastSeenAt);
  return `${hostPart} · ${visitCount} visit${visitCount === 1 ? "" : "s"} · ${date}`;
}
