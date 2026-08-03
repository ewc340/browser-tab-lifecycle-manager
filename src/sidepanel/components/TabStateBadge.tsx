import type { LifecycleDisplayState } from "../../shared/types.ts";
import { STRINGS } from "../../shared/strings.ts";

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
  const label = LABELS[state];
  const tooltip = STRINGS.tooltips.state[state];
  return (
    <span
      className={`badge badge--${state.toLowerCase().replace("_", "-")}`}
      aria-label={`State: ${label}`}
      title={tooltip}
      data-tooltip={tooltip}
    >
      {label}
    </span>
  );
}
