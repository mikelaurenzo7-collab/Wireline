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

interface Particle {
  id: number;
  cx: number;
  cy: number;
  r: number;
  /** Animation delay offset in seconds */
  delay: number;
  /** Drift amplitude (px) */
  drift: number;
  /** Drift duration (s) */
  duration: number;
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
      delay: rng() * 6,
      drift: 1.5 + rng() * 3,
      duration: 8 + rng() * 12,
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
      style={{ opacity: fieldOpacity }}
    >
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id={`constellation-node-${uid}`}>
            <stop offset="0%" stopColor="var(--primary, #8B3FD6)" stopOpacity="0.9" />
            <stop offset="100%" stopColor="var(--primary, #8B3FD6)" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* Connection filaments */}
        {connections.map(({ from, to, distance }) => {
          const opacity = Math.max(0, 1 - distance / connectionRadius) * 0.35;
          return (
            <line
              key={`${from}-${to}`}
              x1={particles[from].cx}
              y1={particles[from].cy}
              x2={particles[to].cx}
              y2={particles[to].cy}
              stroke="var(--primary, #8B3FD6)"
              strokeWidth="0.15"
              strokeOpacity={opacity}
              className="constellation-filament"
            />
          );
        })}

        {/* Particle nodes */}
        {particles.map((p) => (
          <g key={p.id} className="constellation-node">
            {/* Soft glow halo */}
            <circle
              cx={p.cx}
              cy={p.cy}
              r={p.r * 3}
              fill={`url(#constellation-node-${uid})`}
              opacity={p.opacity * 0.4}
              style={{
                animation: `constellation-drift-${uid} ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
              }}
            />
            {/* Core particle */}
            <circle
              cx={p.cx}
              cy={p.cy}
              r={p.r}
              fill="var(--primary, #8B3FD6)"
              opacity={p.opacity}
              style={{
                animation: `constellation-drift-${uid} ${p.duration}s ease-in-out ${p.delay}s infinite alternate`,
              }}
            />
          </g>
        ))}
      </svg>

      {/* Inline keyframes — scoped to this instance */}
      <style>{`
        @keyframes constellation-drift-${uid} {
          0% { transform: translate(0, 0); }
          100% { transform: translate(${particles[0]?.drift ?? 2}px, ${-(particles[1]?.drift ?? 1.5)}px); }
        }
        @media (prefers-reduced-motion: reduce) {
          .constellation-node,
          .constellation-filament {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
}
