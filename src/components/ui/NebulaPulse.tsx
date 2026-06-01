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
import React, { useId, useMemo } from "react";
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

/** Wireline plasma palette — violet, magenta, deep indigo, soft rose. */
const PLASMA_COLORS = [
  "rgba(139, 63, 214, VAR)", // brand violet
  "rgba(183, 63, 214, VAR)", // magenta
  "rgba(88, 28, 135, VAR)", // deep indigo
  "rgba(214, 63, 150, VAR)", // soft rose
  "rgba(107, 43, 200, VAR)", // cool purple
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
  duration: number;
  delay: number;
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
      duration: 12 + rng() * 18,
      delay: rng() * 8,
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
  const uid = useId().replace(/:/g, "");
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
      style={{ opacity: fieldOpacity }}
    >
      {plasmaNodes.map((node) => (
        <div
          key={node.id}
          className="absolute nebula-plasma-node"
          style={{
            left: `${node.cx}%`,
            top: `${node.cy}%`,
            width: `${node.size}%`,
            height: `${node.size}%`,
            transform: "translate(-50%, -50%)",
            background: `radial-gradient(circle, ${node.color} 0%, transparent 70%)`,
            filter: "blur(40px)",
            animation: `nebula-drift-${uid}-${node.id} ${node.duration}s ease-in-out ${node.delay}s infinite alternate`,
          }}
        />
      ))}

      <style>{`
        ${plasmaNodes
          .map(
            (node) => `
          @keyframes nebula-drift-${uid}-${node.id} {
            0% { transform: translate(-50%, -50%) scale(1) rotate(0deg); }
            33% { transform: translate(calc(-50% + ${node.id % 2 === 0 ? "" : "-"}8%), calc(-50% + ${node.id % 2 === 0 ? "-" : ""}6%)) scale(1.15) rotate(${60 + node.id * 30}deg); }
            66% { transform: translate(calc(-50% - ${5 + node.id * 2}%), calc(-50% + ${4 + node.id}%)) scale(0.9) rotate(${120 + node.id * 20}deg); }
            100% { transform: translate(-50%, -50%) scale(1.05) rotate(${180 + node.id * 15}deg); }
          }
        `,
          )
          .join("\n")}
        @media (prefers-reduced-motion: reduce) {
          .nebula-plasma-node {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
