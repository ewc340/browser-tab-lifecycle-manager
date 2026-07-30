import type { LifecycleDisplayState } from "../../shared/types.ts";

interface TabStateBadgeProps {
  state: LifecycleDisplayState;
}

const LABELS: Record<LifecycleDisplayState, string> = {
  ACTIVE: "Active",
  BACKGROUND: "Background",
  IDLE: "Sleeping",
  PENDING_CLOSE: "Closing soon",
  UNAVAILABLE: "Unavailable",
};

export function TabStateBadge({ state }: TabStateBadgeProps) {
  return (
    <span className={`badge badge--${state.toLowerCase().replace("_", "-")}`} aria-label={`State: ${LABELS[state]}`}>
      {LABELS[state]}
    </span>
  );
}
