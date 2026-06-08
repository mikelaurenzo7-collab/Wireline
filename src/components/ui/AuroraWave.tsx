/**
 * AuroraWave — CSS-driven undulating wave backdrop.
 *
 * A zero-JS ambient background element that renders layered sinusoidal
 * SVG wave paths with staggered CSS animations. The waves drift laterally
 * and vertically, creating an organic, breathing aurora atmosphere.
 *
 * Design: Uses brand purple gradients at ultra-low opacity so it reads
 * as atmospheric luminosity rather than a heavy visual element.
 * Fully dark-mode aware and reduced-motion safe.
 *
 * Usage:
 *   <AuroraWave layers={3} className="absolute inset-0 -z-10" />
 *   <AuroraWave layers={5} intensity="strong" />
 */
import React, { useId } from "react";
import { cn } from "../../lib/utils";
import { BRAND_FALLBACK } from "../../lib/brand-token";

const PRIMARY_FALLBACK = `var(--primary, ${BRAND_FALLBACK})`;

type WaveIntensity = "subtle" | "medium" | "strong";

interface AuroraWaveProps {
  /** Number of wave layers (1–6). Default 3. */
  layers?: number;
  /** Visual intensity / opacity level. Default "subtle". */
  intensity?: WaveIntensity;
  /** Height of the wave region. Default "100%". */
  height?: string;
  className?: string;
}

const INTENSITY_MAP: Record<WaveIntensity, number> = {
  subtle: 0.04,
  medium: 0.08,
  strong: 0.14,
};

/**
 * Generates an SVG wave path string with the given parameters.
 */
function wavePath(amplitude: number, frequency: number, phase: number, yOffset: number): string {
  const points: string[] = [];
  const steps = 100;

  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 200; // Double-width for seamless loop
    const y = yOffset + Math.sin((i / steps) * Math.PI * 2 * frequency + phase) * amplitude;
    points.push(`${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }

  // Close the path at the bottom
  points.push(`L 200 110 L 0 110 Z`);
  return points.join(" ");
}

/**
 * AuroraWave — layered sinusoidal ambient backdrop.
 */
export function AuroraWave({
  layers = 3,
  intensity = "subtle",
  height = "100%",
  className,
}: AuroraWaveProps) {
  const uid = useId().replace(/:/g, "");
  const layerCount = Math.max(1, Math.min(6, layers));
  const baseOpacity = INTENSITY_MAP[intensity];

  const waveLayers = Array.from({ length: layerCount }, (_, i) => {
    const amplitude = 8 + i * 4;
    const frequency = 1.5 + i * 0.3;
    const phase = (i * Math.PI) / layerCount;
    const yBase = 50 + i * 6;
    const opacity = baseOpacity * (1 - i * 0.12);

    return {
      id: i,
      path: wavePath(amplitude, frequency, phase, yBase),
      opacity,
    };
  });

  return (
    <div
      className={cn("pointer-events-none select-none overflow-hidden", className)}
      style={{ height }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 200 110"
        preserveAspectRatio="none"
        className="aurora-wave-container w-[200%] h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {waveLayers.map((layer) => (
            <linearGradient
              key={`grad-${layer.id}`}
              id={`aurora-wave-grad-${uid}-${layer.id}`}
              x1="0%"
              y1="0%"
              x2="100%"
              y2="0%"
            >
              <stop offset="0%" stopColor={PRIMARY_FALLBACK} stopOpacity={layer.opacity} />
              <stop offset="50%" stopColor={PRIMARY_FALLBACK} stopOpacity={layer.opacity * 1.5} />
              <stop offset="100%" stopColor={PRIMARY_FALLBACK} stopOpacity={layer.opacity} />
            </linearGradient>
          ))}
        </defs>

        {waveLayers.map((layer) => (
          <path
            key={layer.id}
            d={layer.path}
            fill={`url(#aurora-wave-grad-${uid}-${layer.id})`}
            className="aurora-wave-path"
            data-layer={layer.id}
          />
        ))}
      </svg>
    </div>
  );
}
