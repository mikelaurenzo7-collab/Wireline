import { cn } from "../../lib/utils";
import { WL_SIGNAL_CLASSES } from "../../lib/wireline-signal-design";

const NODES: { cx: number; cy: number; delay: number }[] = [
  { cx: 100, cy: 28, delay: 0 },
  { cx: 158, cy: 52, delay: 0.6 },
  { cx: 172, cy: 108, delay: 1.2 },
  { cx: 142, cy: 158, delay: 1.8 },
  { cx: 58, cy: 158, delay: 2.4 },
  { cx: 28, cy: 108, delay: 3.0 },
];

const ARCS: string[] = [
  "M 100 28 L 158 52 L 172 108",
  "M 172 108 L 142 158 L 58 158",
  "M 58 158 L 28 108 L 100 28",
  "M 158 52 L 100 100",
  "M 28 108 L 100 100",
  "M 142 158 L 100 100",
];

export type FleetConstellationSize = "sm" | "md" | "lg" | "xl";

/**
 * FleetConstellation — dormant agent nodes around a focal orb.
 * Decorative only; shared across Director, empty states, and loading chrome.
 */
export function FleetConstellation({
  className,
  size = "lg",
  refined = true,
}: {
  className?: string;
  size?: FleetConstellationSize;
  refined?: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      className={cn(
        WL_SIGNAL_CLASSES.fleetConstellation,
        `wl-fleet-constellation--${size}`,
        refined && WL_SIGNAL_CLASSES.fleetConstellationRefined,
        className,
      )}
      fill="none"
    >
      <circle className="wl-fleet-constellation-ring" cx="100" cy="100" r="72" strokeWidth="0.75" />
      {ARCS.map((d, i) => (
        <path
          key={i}
          className="wl-fleet-constellation-arc"
          d={d}
          strokeWidth="0.65"
          strokeLinecap="round"
        />
      ))}
      {NODES.map((node, i) => (
        <g key={i} className="wl-fleet-constellation-node" data-delay={`${node.delay}s`}>
          <circle className="wl-fleet-constellation-node-halo" cx={node.cx} cy={node.cy} r="5" />
          <circle className="wl-fleet-constellation-node-core" cx={node.cx} cy={node.cy} r="2.25" />
        </g>
      ))}
    </svg>
  );
}
