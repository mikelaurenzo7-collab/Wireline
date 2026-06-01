/**
 * AgentActivityIndicator — small RobotHead that bounces when the agent is working.
 *
 * Uses the `RobotHead` SVG at 24–32px with a gentle bounce animation when
 * active, and stays still + slightly muted when idle.
 */
import { RobotHead } from "../marketing/RobotHead";
import type { RobotPose } from "../marketing/RobotHead";
import { cn } from "../../lib/utils";

interface AgentActivityIndicatorProps {
  /** Whether the agent is currently working (bounces) or idle (still). */
  active: boolean;
  /** Size in px — defaults to 24. */
  size?: number;
  /** Pose for the robot — defaults to "on-call". */
  pose?: RobotPose;
  className?: string;
}

export function AgentActivityIndicator({
  active,
  size = 24,
  pose = "on-call",
  className,
}: AgentActivityIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center shrink-0",
        active && "wl-agent-bounce",
        !active && "opacity-70",
        className,
      )}
      aria-label={active ? "Agent is working" : "Agent idle"}
    >
      <RobotHead pose={pose} size={size} animated={active} variant={1} />
    </span>
  );
}
