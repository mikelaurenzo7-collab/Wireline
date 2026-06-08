/**
 * ConstellationField — Generative SVG particle network visualization.
 *
 * Renders an animated field of interconnected luminous nodes (particles)
 * that drift slowly and draw thin connecting filaments when within proximity.
 * The effect evokes a neural constellation — premium, ambient, living.
 *
 * Design tokens: Uses --color-brand, --color-brand-deep for node fills
 * and connection strokes. Fully dark-mode aware. Reduced-motion safe.
 *
 * Usage:
 *   <ConstellationField density={24} className="absolute inset-0" />
 *   <ConstellationField density={12} interactive />
 */
import React, { useId, useMemo } from "react";
import { cn } from "../../lib/utils";
import { BRAND_FALLBACK } from "../../lib/brand-token";
import { asStyle } from "@/src/lib/css-style";

const PRIMARY_FALLBACK = `var(--primary, ${BRAND_FALLBACK})`;

interface Particle {
  id: number;
  cx: number;
  cy: number;
  r: number;
  /** Opacity 0–1 */
  opacity: number;
}

interface ConstellationFieldProps {
  /** Number of particles to render. Default 20. */
  density?: number;
  /** Enable subtle mouse-proximity glow (future: pointer interaction). */
  interactive?: boolean;
  /** Max distance (in SVG units out of 100) for drawing connections. Default 28. */
  connectionRadius?: number;
  /** Overall opacity of the entire field. Default 1. */
  fieldOpacity?: number;
  className?: string;
  /** Seed for deterministic layout (useful for SSR/tests). Default 42. */
  seed?: number;
}

/** Simple seeded PRNG (mulberry32) for deterministic particle placement. */
function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateParticles(count: number, seed: number): Particle[] {
  const rng = seededRandom(seed);
  const particles: Particle[] = [];

  for (let i = 0; i < count; i++) {
    particles.push({
      id: i,
      cx: rng() * 100,
      cy: rng() * 100,
      r: 0.4 + rng() * 0.8,
      opacity: 0.3 + rng() * 0.5,
    });
  }

  return particles;
}

interface Connection {
  from: number;
  to: number;
  distance: number;
}

function computeConnections(particles: Particle[], maxDist: number): Connection[] {
  const connections: Connection[] = [];

  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].cx - particles[j].cx;
      const dy = particles[i].cy - particles[j].cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= maxDist) {
        connections.push({ from: i, to: j, distance: dist });
      }
    }
  }

  return connections;
}

function driftClass(id: number): string {
  return `constellation-drift-${id % 8}`;
}

function delayClass(id: number): string {
  return `constellation-delay-${id % 8}`;
}

/**
 * ConstellationField — ambient generative SVG particle network.
 */
export function ConstellationField({
  density = 20,
  interactive = false,
  connectionRadius = 28,
  fieldOpacity = 1,
  className,
  seed = 42,
}: ConstellationFieldProps) {
  const uid = useId().replace(/:/g, "");

  const particles = useMemo(() => generateParticles(density, seed), [density, seed]);
  const connections = useMemo(
    () => computeConnections(particles, connectionRadius),
    [particles, connectionRadius],
  );

  return (
    <div
      className={cn(
        "pointer-events-none select-none",
        interactive && "pointer-events-auto",
        className,
      )}
      aria-hidden="true"
      style={asStyle({ opacity: fieldOpacity })}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id={`constellation-node-${uid}`}>
            <stop offset="0%" stopColor={PRIMARY_FALLBACK} stopOpacity="0.9" />
            <stop offset="100%" stopColor={PRIMARY_FALLBACK} stopOpacity="0" />
          </radialGradient>
        </defs>

        {connections.map(({ from, to, distance }) => {
          const opacity = Math.max(0, 1 - distance / connectionRadius) * 0.35;
          return (
            <line
              key={`${from}-${to}`}
              x1={particles[from].cx}
              y1={particles[from].cy}
              x2={particles[to].cx}
              y2={particles[to].cy}
              stroke={PRIMARY_FALLBACK}
              strokeWidth="0.15"
              strokeOpacity={opacity}
              className="constellation-filament"
            />
          );
        })}

        {particles.map((p) => (
          <g key={p.id} className="constellation-node">
            <circle
              cx={p.cx}
              cy={p.cy}
              r={p.r * 3}
              fill={`url(#constellation-node-${uid})`}
              opacity={p.opacity * 0.4}
              className={cn(driftClass(p.id), delayClass(p.id))}
            />
            <circle
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill={PRIMARY_FALLBACK}
              opacity={p.opacity}
              className={cn(driftClass(p.id), delayClass(p.id))}
            />
          </g>
        ))}
      </svg>
    </div>
  );
}
