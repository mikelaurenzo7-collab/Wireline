import { useMemo } from "react";
import "../../styles/voice-ops-visual.css";

/**
 * Calm operator-grade "real-time voice processing" visual for the landing page.
 * Raw waveform → small neural layer → cleaned waveform, rendered with SVG/CSS
 * (no WebGL). Intentionally light on copy.
 */

const BAR_COUNT = 56;

function rawHeights() {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const base = Math.abs(Math.sin(i * 0.55)) * 0.6 + Math.abs(Math.sin(i * 1.7)) * 0.4;
    const jitter = ((i * 53) % 11) / 11; // deterministic texture
    return Math.round((0.25 + base * 0.6 + jitter * 0.15) * 100);
  });
}

function cleanHeights() {
  return Array.from({ length: BAR_COUNT }, (_, i) => {
    const env = Math.sin((i / BAR_COUNT) * Math.PI); // smooth envelope
    return Math.round((0.2 + Math.abs(Math.sin(i * 0.4 + 1)) * 0.55 * env + env * 0.2) * 100);
  });
}

function Waveform({ heights, tone }: { heights: number[]; tone: "raw" | "clean" }) {
  const color = tone === "clean" ? "var(--wl-accent-foreground)" : "var(--wl-accent-fixed-dim)";
  const opacity = tone === "clean" ? 0.95 : 0.7;
  return (
    <div className="flex h-14 w-full items-center gap-[2px]" aria-hidden>
      {heights.map((h, i) => (
        <span
          key={i}
          className="wl-vo-bar block flex-1 rounded-full"
          style={{
            height: `${Math.max(8, h)}%`,
            background: color,
            opacity,
            animationDelay: `${(i % 8) * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

function NeuralLayer() {
  const layers = [4, 5, 5, 3];
  const width = 320;
  const height = 96;
  const colX = (c: number) => 24 + (c * (width - 48)) / (layers.length - 1);
  const nodeY = (count: number, idx: number) => {
    const gap = height / (count + 1);
    return gap * (idx + 1);
  };
  const nodes = layers.map((count, c) =>
    Array.from({ length: count }, (_, idx) => ({ x: colX(c), y: nodeY(count, idx) })),
  );
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-24 w-full"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      {nodes
        .slice(0, -1)
        .flatMap((col, c) =>
          col.flatMap((from, fi) =>
            nodes[c + 1].map((to, ti) => (
              <line
                key={`l-${c}-${fi}-${ti}`}
                x1={from.x}
                y1={from.y}
                x2={to.x}
                y2={to.y}
                stroke="var(--wl-accent-fixed-dim)"
                strokeWidth={0.6}
                className={(fi + ti) % 3 === 0 ? "wl-vo-link" : undefined}
                opacity={0.35}
              />
            )),
          ),
        )}
      {nodes.flatMap((col, c) =>
        col.map((n, i) => (
          <circle
            key={`n-${c}-${i}`}
            cx={n.x}
            cy={n.y}
            r={3.4}
            fill={
              c === 0 || c === nodes.length - 1
                ? "var(--wl-accent-foreground)"
                : "var(--wl-accent-fixed-dim)"
            }
            className="wl-vo-node"
            style={{ animationDelay: `${(c * 5 + i) * 0.18}s` }}
          />
        )),
      )}
    </svg>
  );
}

export default function VoiceOpsVisual() {
  const raw = useMemo(rawHeights, []);
  const clean = useMemo(cleanHeights, []);
  const rows: Array<{ tag: string; node: React.ReactNode }> = [
    { tag: "Hears", node: <Waveform heights={raw} tone="raw" /> },
    { tag: "Thinks", node: <NeuralLayer /> },
    { tag: "Speaks", node: <Waveform heights={clean} tone="clean" /> },
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-[color:var(--wl-accent-deep)] bg-[#02201b] p-6 shadow-[0_1px_2px_rgba(0,0,0,0.18)] sm:p-8">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.14em] text-[color:var(--wl-accent-fixed-dim)]">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--wl-accent-fixed-dim)]" />
          On a call
        </span>
        <span className="font-mono text-[11px] tracking-[.06em] text-[color:var(--wl-accent-fixed-dim)]/70">
          ~15ms
        </span>
      </div>
      <div className="mt-6 space-y-5">
        {rows.map((row, i) => (
          <div key={row.tag}>
            <div className="grid grid-cols-[64px_minmax(0,1fr)] items-center gap-4">
              <span className="font-mono text-[11px] uppercase tracking-[.1em] text-[color:var(--wl-accent-fixed-dim)]/80">
                {row.tag}
              </span>
              {row.node}
            </div>
            {i < rows.length - 1 ? (
              <div className="mt-5 h-px w-full bg-[color:var(--wl-accent-fixed-dim)]/15" />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
