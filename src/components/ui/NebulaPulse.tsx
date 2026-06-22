/**
 * NebulaPulse — Holographic plasma field background primitive.
 *
 * Renders a generative, GPU-composited radial plasma that drifts and
 * morphs with organic timing. The effect reads as a living cosmic nebula
 * behind content — an unmistakable Wireline signature visible on hero
 * sections, loading states, and empty workspace canvases.
 *
 * Three luminous plasma nodes orbit independently, each with its own
 * size, colour temperature, and speed. The combination produces an
 * infinite non-repeating pattern that feels alive.
 *
 * Performance: uses transform + opacity only (compositor thread).
 * Reduced-motion safe — freezes to a static gradient.
 *
 * Usage:
 *   <NebulaPulse className="absolute inset-0 -z-10" />
 *   <NebulaPulse intensity="vivid" nodes={4} />
 */
import React, { useMemo } from "react";
import { cn } from "../../lib/utils";

type NebulaIntensity = "whisper" | "ambient" | "vivid";

interface NebulaPulseProps {
  /** Number of plasma nodes (1–5). Default 3. */
  nodes?: number;
  /** Visual intensity. Default "ambient". */
  intensity?: NebulaIntensity;
  /** Overall field opacity. Default 1. */
  fieldOpacity?: number;
  className?: string;
  /** Seed for deterministic placement (tests/SSR). Default 7. */
  seed?: number;
}

const INTENSITY_OPACITY: Record<NebulaIntensity, number> = {
  whisper: 0.15,
  ambient: 0.28,
  vivid: 0.45,
};

/** Wireline Precision plasma palette — signal blue, slate-blue surfaces, and active containers. */
const PLASMA_COLORS = [
  "rgba(93, 63, 211, VAR)", // Ametrine Purple (#5D3FD3)
  "rgba(72, 69, 84, VAR)", // Secondary text color (#484554)
  "rgba(230, 222, 255, VAR)", // Active container (#E6DEFF)
  "rgba(239, 244, 255, VAR)", // Secondary surface (#EFF4FF)
  "rgba(248, 249, 255, VAR)", // Ametrine Precision canvas (#F8F9FF)
];

function seededRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PlasmaNode {
  id: number;
  cx: number;
  cy: number;
  size: number;
  color: string;
}

function generateNodes(count: number, seed: number, opacity: number): PlasmaNode[] {
  const rng = seededRng(seed);
  const nodes: PlasmaNode[] = [];

  for (let i = 0; i < count; i++) {
    const color = PLASMA_COLORS[i % PLASMA_COLORS.length].replace("VAR", String(opacity));
    nodes.push({
      id: i,
      cx: 20 + rng() * 60,
      cy: 20 + rng() * 60,
      size: 30 + rng() * 40,
      color,
    });
  }

  return nodes;
}

/**
 * NebulaPulse — living plasma field with organic drift.
 */
export function NebulaPulse({
  nodes = 3,
  intensity = "ambient",
  fieldOpacity = 1,
  className,
  seed = 7,
}: NebulaPulseProps) {
  const nodeCount = Math.max(1, Math.min(5, nodes));
  const opacity = INTENSITY_OPACITY[intensity];

  const plasmaNodes = useMemo(
    () => generateNodes(nodeCount, seed, opacity),
    [nodeCount, seed, opacity],
  );

  return (
    <div
      className={cn("pointer-events-none select-none overflow-hidden", className)}
      aria-hidden="true"
      data-opacity={fieldOpacity}
    >
      {plasmaNodes.map((node) => (
        <div
          key={node.id}
          className={cn(
            "absolute nebula-plasma-node",
            `nebula-drift-${node.id}`,
            `nebula-delay-${node.id % 5}`,
          )}
          data-plasma-left={`${node.cx}%`}
          data-plasma-top={`${node.cy}%`}
          data-plasma-size={`${node.size}%`}
          data-plasma-color={node.color}
        />
      ))}
    </div>
  );
}
