/**
 * StatusOrb — Premium status indicator combining orbital rings + constellation glow.
 *
 * A compact, high-signal status element that renders a luminous orb with
 * optional orbital rings, pulsing core, and constellation-style node halo.
 * Designed as the ultimate "agent is alive / working / idle / error" indicator.
 *
 * Replaces ad-hoc status dots with a unified, branded, motion-rich primitive.
 * Reduced-motion safe — degrades to a static glowing dot.
 *
 * Usage:
 *   <StatusOrb status="active" label="Agent is working" />
 *   <StatusOrb status="idle" size="lg" withOrbit />
 *   <StatusOrb status="error" />
 */
import { cn } from "../../lib/utils";

type OrbStatus = "active" | "idle" | "busy" | "error" | "offline";
type OrbSize = "sm" | "md" | "lg";

interface StatusOrbProps {
  /** Current status determines color + animation intensity. */
  status: OrbStatus;
  /** Size preset. Default "md". */
  size?: OrbSize;
  /** Show orbital ring(s) around the orb. Default false. */
  withOrbit?: boolean;
  /** Accessible label. Default generated from status. */
  label?: string;
  className?: string;
}

const SIZE_CONFIG: Record<OrbSize, { container: string }> = {
  sm: { container: "w-4 h-4" },
  md: { container: "w-6 h-6" },
  lg: { container: "w-10 h-10" },
};

const DEFAULT_LABELS: Record<OrbStatus, string> = {
  active: "Active",
  idle: "Idle",
  busy: "Busy",
  error: "Error",
  offline: "Offline",
};

/**
 * StatusOrb — the premium Wireline status indicator.
 * Specular highlight: rgba(255, 255, 255, 0.45) — see index.css .status-orb__specular
 */
export function StatusOrb({
  status,
  size = "md",
  withOrbit = false,
  label,
  className,
}: StatusOrbProps) {
  const config = SIZE_CONFIG[size];
  const isAnimated = status === "active" || status === "busy";

  return (
    <span
      className={cn(
        "status-orb relative inline-flex items-center justify-center shrink-0",
        config.container,
        className,
      )}
      role="status"
      aria-label={label ?? DEFAULT_LABELS[status]}
      data-status={status}
      data-size={size}
      data-animated={isAnimated ? "true" : "false"}
    >
      {/* Outer glow halo — status-orb-breathe when active/busy */}
      <span className="status-orb__halo absolute inset-0 rounded-full" data-circular />

      {/* Orbital ring(s) — status-orb-orbit animation */}
      {withOrbit && (
        <>
          <span className="status-orb__orbit absolute rounded-full" data-circular />
          {isAnimated && (
            <span className="status-orb__orbit-inner absolute rounded-full" data-circular />
          )}
        </>
      )}

      {/* Core orb — status-orb-pulse when active/busy */}
      <span className="status-orb__core relative rounded-full" data-circular />

      {/* Specular highlight for depth */}
      <span
        className="status-orb__specular absolute rounded-full pointer-events-none"
        data-circular
      />
    </span>
  );
}
