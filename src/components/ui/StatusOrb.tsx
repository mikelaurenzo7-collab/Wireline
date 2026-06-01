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
import React from "react";
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

const STATUS_COLORS: Record<OrbStatus, { core: string; glow: string; ring: string }> = {
  active: {
    core: "#8B3FD6",
    glow: "rgba(139, 63, 214, 0.4)",
    ring: "rgba(139, 63, 214, 0.3)",
  },
  idle: {
    core: "#8B6FA8",
    glow: "rgba(139, 111, 168, 0.25)",
    ring: "rgba(139, 111, 168, 0.15)",
  },
  busy: {
    core: "#D97706",
    glow: "rgba(217, 119, 6, 0.35)",
    ring: "rgba(217, 119, 6, 0.25)",
  },
  error: {
    core: "#E8466A",
    glow: "rgba(232, 70, 106, 0.4)",
    ring: "rgba(232, 70, 106, 0.3)",
  },
  offline: {
    core: "#5A534A",
    glow: "rgba(90, 83, 74, 0.15)",
    ring: "rgba(90, 83, 74, 0.1)",
  },
};

const SIZE_CONFIG: Record<OrbSize, { container: string; core: number; orbitInset: number }> = {
  sm: { container: "w-4 h-4", core: 5, orbitInset: -3 },
  md: { container: "w-6 h-6", core: 7, orbitInset: -4 },
  lg: { container: "w-10 h-10", core: 12, orbitInset: -6 },
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
 */
export function StatusOrb({
  status,
  size = "md",
  withOrbit = false,
  label,
  className,
}: StatusOrbProps) {
  const colors = STATUS_COLORS[status];
  const config = SIZE_CONFIG[size];
  const isAnimated = status === "active" || status === "busy";

  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center shrink-0",
        config.container,
        className,
      )}
      role="status"
      aria-label={label ?? DEFAULT_LABELS[status]}
    >
      {/* Outer glow halo */}
      <span
        className="absolute inset-0 rounded-full"
        data-circular
        style={{
          backgroundColor: colors.glow,
          filter: "blur(4px)",
          opacity: isAnimated ? 1 : 0.5,
          animation: isAnimated ? "status-orb-breathe 2.4s ease-in-out infinite" : undefined,
        }}
      />

      {/* Orbital ring(s) */}
      {withOrbit && (
        <>
          <span
            className="absolute rounded-full"
            data-circular
            style={{
              inset: `${config.orbitInset}px`,
              border: `1.5px solid ${colors.ring}`,
              animation: isAnimated ? "status-orb-orbit 3s linear infinite" : undefined,
            }}
          />
          {isAnimated && (
            <span
              className="absolute rounded-full"
              data-circular
              style={{
                inset: `${config.orbitInset - 2}px`,
                border: `1px solid ${colors.ring}`,
                opacity: 0.5,
                animation: "status-orb-orbit 4.5s linear infinite reverse",
              }}
            />
          )}
        </>
      )}

      {/* Core orb */}
      <span
        className="relative rounded-full"
        data-circular
        style={{
          width: `${config.core}px`,
          height: `${config.core}px`,
          backgroundColor: colors.core,
          boxShadow: `0 0 8px ${colors.glow}, inset 0 1px 2px rgba(255,255,255,0.3)`,
          animation: isAnimated ? "status-orb-pulse 1.8s ease-in-out infinite" : undefined,
        }}
      />

      {/* Specular highlight */}
      <span
        className="absolute rounded-full pointer-events-none"
        data-circular
        style={{
          width: `${config.core * 0.4}px`,
          height: `${config.core * 0.4}px`,
          top: "35%",
          left: "55%",
          transform: "translate(-50%, -50%)",
          backgroundColor: "rgba(255, 255, 255, 0.45)",
          filter: "blur(0.5px)",
        }}
      />
    </span>
  );
}
