import { cn } from "../../lib/utils";
import { WL_SIGNAL_CLASSES } from "../../lib/wireline-signal-design";

const NODES: { cx: number; cy: number; delay: number }[] = [
  { cx: 100, cy: 28, delay: 0 },
  { cx: 158, cy: 100, delay: 0.6 },
  { cx: 100, cy: 172, delay: 1.2 },
  { cx: 42, cy: 100, delay: 1.8 },
];

export type AssistantConstellationSize = "sm" | "md" | "lg" | "xl";

/**
 * AssistantConstellation — minimal orbit frame around a focal orb.
 * Decorative only; shared across empty states and loading chrome.
 */
export function AssistantConstellation({
  className,
  size = "lg",
  refined = true,
}: {
  className?: string;
  size?: AssistantConstellationSize;
  refined?: boolean;
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 200"
      className={cn(
        WL_SIGNAL_CLASSES.fleetConstellation,
        `wl-Assistants-constellation--${size}`,
        refined && WL_SIGNAL_CLASSES.fleetConstellationRefined,
        className,
      )}
      fill="none"
    >
      <circle
        className="wl-Assistants-constellation-ring"
        cx="100"
        cy="100"
        r="72"
        strokeWidth="0.75"
      />
      {NODES.map((node, i) => (
        <g key={i} className="wl-Assistants-constellation-node" data-delay={`${node.delay}s`}>
          <circle
            className="wl-Assistants-constellation-node-halo"
            cx={node.cx}
            cy={node.cy}
            r="4"
          />
          <circle
            className="wl-Assistants-constellation-node-core"
            cx={node.cx}
            cy={node.cy}
            r="1.5"
          />
        </g>
      ))}
    </svg>
  );
}
