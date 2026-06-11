/**
 * Wireline Design System — Full Primitive Test Suite
 *
 * Covers ALL design system primitives:
 *   CONSTELLATION ERA: ConstellationField, PulseRing, AuroraWave, StatusOrb
 *   IDENTITY v3:       NebulaPulse, GlyphMorph, PrismBadge, VoidButton, SignalThread
 *
 * Tests verify logic, structural contracts, accessibility, and motion safety
 * without requiring a DOM renderer.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readComponent(name: string): string {
  return fs.readFileSync(path.resolve(__dirname, `../${name}.tsx`), "utf8");
}

function readIndexCss(): string {
  return fs.readFileSync(
    path.resolve(__dirname, "../../../styles/wireline-design-system.css"),
    "utf8",
  );
}

// ═══════════════════════════════════════════════════════════════════
// CONSTELLATION ERA PRIMITIVES
// ═══════════════════════════════════════════════════════════════════

describe("ConstellationField", () => {
  const src = readComponent("ConstellationField");

  it("exports a ConstellationField function component", () => {
    expect(src).toContain("export function ConstellationField");
  });

  it("uses a seeded PRNG for deterministic layout", () => {
    expect(src).toContain("seededRandom");
    expect(src).toContain("seed");
  });

  it("renders an SVG with viewBox 0 0 100 100", () => {
    expect(src).toContain('viewBox="0 0 100 100"');
  });

  it("computes connections between particles within radius", () => {
    expect(src).toContain("computeConnections");
    expect(src).toContain("connectionRadius");
  });

  it("is aria-hidden for accessibility", () => {
    expect(src).toContain('aria-hidden="true"');
  });

  it("includes reduced-motion media query in global CSS", () => {
    expect(readIndexCss()).toContain("prefers-reduced-motion");
    expect(src).toContain("constellation-drift-");
  });

  it("renders line elements for filaments", () => {
    expect(src).toContain("<line");
    expect(src).toContain("constellation-filament");
  });

  it("renders circle elements for particle nodes", () => {
    expect(src).toContain("<circle");
    expect(src).toContain("constellation-node");
  });

  it("uses radialGradient for node glow", () => {
    expect(src).toContain("<radialGradient");
  });

  it("supports interactive pointer-events override", () => {
    expect(src).toContain("pointer-events-none");
    expect(src).toContain("pointer-events-auto");
  });
});

describe("PulseRing", () => {
  const src = readComponent("PulseRing");

  it("exports a PulseRing function component", () => {
    expect(src).toContain("export function PulseRing");
  });

  it("clamps ring count between 1 and 5", () => {
    expect(src).toContain("Math.max(1, Math.min(5, rings))");
  });

  it("supports brand/emerald/destructive/muted color presets", () => {
    expect(src).toContain('"brand"');
    expect(src).toContain('"emerald"');
    expect(src).toContain('"destructive"');
    expect(src).toContain('"muted"');
  });

  it("supports sm/md/lg size presets", () => {
    expect(src).toContain("w-8 h-8");
    expect(src).toContain("w-14 h-14");
    expect(src).toContain("w-24 h-24");
  });

  it("uses pulse-ring-expand keyframe animation via CSS classes", () => {
    expect(src).toContain("pulse-ring__ring");
    expect(readIndexCss()).toContain("pulse-ring-expand");
  });

  it("reduces visual feedback when inactive", () => {
    expect(src).toContain("active");
    expect(src).toContain("opacity");
  });

  it("renders children in a relative z-[1] container", () => {
    expect(src).toContain("z-[1]");
    expect(src).toContain("{children}");
  });

  it("uses data-circular for border-radius exception", () => {
    expect(src).toContain("data-circular");
  });
});

describe("AuroraWave", () => {
  const src = readComponent("AuroraWave");

  it("exports an AuroraWave function component", () => {
    expect(src).toContain("export function AuroraWave");
  });

  it("clamps layers between 1 and 6", () => {
    expect(src).toContain("Math.max(1, Math.min(6, layers))");
  });

  it("generates SVG path elements for each wave", () => {
    expect(src).toContain("<path");
    expect(src).toContain("wavePath");
  });

  it("uses linearGradient fills with brand color", () => {
    expect(src).toContain("<linearGradient");
    expect(src).toContain("--primary");
  });

  it("supports subtle/medium/strong intensity levels", () => {
    expect(src).toContain("subtle");
    expect(src).toContain("medium");
    expect(src).toContain("strong");
  });

  it("generates wave using sine function", () => {
    expect(src).toContain("Math.sin");
  });

  it("is aria-hidden", () => {
    expect(src).toContain('aria-hidden="true"');
  });

  it("includes reduced-motion guard in global CSS", () => {
    expect(readIndexCss()).toContain("prefers-reduced-motion");
    expect(src).toContain("aurora-wave-path");
  });

  it("uses translateX(-50%) for seamless loop panning via CSS", () => {
    expect(src).toContain("aurora-wave-container");
    expect(readIndexCss()).toContain("translateX(-50%)");
  });
});

describe("StatusOrb", () => {
  const src = readComponent("StatusOrb");

  it("exports a StatusOrb function component", () => {
    expect(src).toContain("export function StatusOrb");
  });

  it("uses role=status for accessibility", () => {
    expect(src).toContain('role="status"');
  });

  it("provides aria-label from status or custom label", () => {
    expect(src).toContain("aria-label");
    expect(src).toContain("DEFAULT_LABELS");
  });

  it("supports all 5 status variants", () => {
    expect(src).toContain("active");
    expect(src).toContain("idle");
    expect(src).toContain("busy");
    expect(src).toContain("error");
    expect(src).toContain("offline");
  });

  it("gates animation on active/busy states only", () => {
    expect(src).toContain('status === "active" || status === "busy"');
  });

  it("supports sm/md/lg sizes", () => {
    expect(src).toContain("w-4 h-4");
    expect(src).toContain("w-6 h-6");
    expect(src).toContain("w-10 h-10");
  });

  it("renders orbital rings conditionally with withOrbit prop", () => {
    expect(src).toContain("withOrbit");
    expect(src).toContain("status-orb-orbit");
  });

  it("uses data-circular for border-radius exception", () => {
    expect(src).toContain("data-circular");
  });

  it("renders specular highlight for depth", () => {
    const css = readIndexCss();
    expect(src).toContain("status-orb__specular");
    expect(css).toContain("rgba(255, 255, 255, 0.45)");
    expect(css).toContain("blur(0.5px)");
  });

  it("uses status-orb-breathe and status-orb-pulse keyframes", () => {
    expect(src).toContain("status-orb-breathe");
    expect(src).toContain("status-orb-pulse");
  });
});

// ═══════════════════════════════════════════════════════════════════
// IDENTITY v3 PRIMITIVES
// ═══════════════════════════════════════════════════════════════════

describe("NebulaPulse", () => {
  const src = readComponent("NebulaPulse");

  it("exports a NebulaPulse function component", () => {
    expect(src).toContain("export function NebulaPulse");
  });

  it("uses a seeded RNG for deterministic plasma placement", () => {
    expect(src).toContain("seededRng");
    expect(src).toContain("seed");
  });

  it("clamps node count between 1 and 5", () => {
    expect(src).toContain("Math.max(1, Math.min(5, nodes))");
  });

  it("supports whisper/ambient/vivid intensity levels", () => {
    expect(src).toContain("whisper");
    expect(src).toContain("ambient");
    expect(src).toContain("vivid");
  });

  it("renders plasma nodes with radial gradients", () => {
    const css = readIndexCss();
    expect(css).toContain("radial-gradient");
    expect(src).toContain("nebula-plasma-node");
  });

  it("applies blur filter for atmospheric softness via CSS", () => {
    expect(src).toContain("nebula-plasma-node");
    expect(readIndexCss()).toContain("blur(40px)");
  });

  it("is aria-hidden for accessibility", () => {
    expect(src).toContain('aria-hidden="true"');
  });

  it("includes reduced-motion media query in global CSS", () => {
    expect(readIndexCss()).toContain("prefers-reduced-motion");
    expect(src).toContain("nebula-drift-");
  });

  it("uses Wireline brand palette (violet, magenta, indigo, rose)", () => {
    expect(src).toContain("139, 63, 214"); // brand violet
    expect(src).toContain("183, 63, 214"); // magenta
    expect(src).toContain("88, 28, 135"); // deep indigo
    expect(src).toContain("214, 63, 150"); // soft rose
  });

  it("uses shared nebula drift preset classes (not per-instance keyframes)", () => {
    expect(src).toContain("nebula-drift-");
    expect(src).toContain("nebula-delay-");
    expect(readIndexCss()).toContain("@keyframes nebula-drift-");
  });
});

describe("GlyphMorph", () => {
  const src = readComponent("GlyphMorph");

  it("exports a GlyphMorph function component", () => {
    expect(src).toContain("export function GlyphMorph");
  });

  it("splits text into per-character spans", () => {
    expect(src).toContain("text.split");
    expect(src).toContain("glyph-morph-char");
  });

  it("supports reveal/breathe/glitch animation modes", () => {
    expect(src).toContain('"reveal"');
    expect(src).toContain('"breathe"');
    expect(src).toContain('"glitch"');
  });

  it("staggers animation delay per character", () => {
    const css = readIndexCss();
    expect(src).toContain("data-stagger");
    expect(src).toContain("data-index");
    expect(css).toContain("animation-delay: calc(var(--glyph-stagger");
  });

  it("uses editorial spring easing for reveal mode", () => {
    expect(readIndexCss()).toContain("cubic-bezier(0.22, 1, 0.36, 1)");
  });

  it("uses step timing for glitch mode", () => {
    expect(readIndexCss()).toContain("steps(2, jump-none)");
  });

  it("provides aria-label on container for accessibility", () => {
    expect(src).toContain("aria-label={text}");
  });

  it("hides individual chars from screen readers", () => {
    expect(src).toContain('aria-hidden="true"');
  });

  it("handles spaces as non-breaking space", () => {
    expect(src).toContain("\\u00A0");
  });

  it("includes reduced-motion guard", () => {
    const css = readIndexCss();
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(".glyph-morph-char");
  });

  it("supports multiple HTML element tags", () => {
    expect(src).toContain('"span"');
    expect(src).toContain('"h1"');
    expect(src).toContain('"h2"');
  });

  it("uses 3D transforms for reveal depth", () => {
    const css = readIndexCss();
    expect(css).toContain("rotateX");
    expect(css).toContain("scale(0.85)");
  });

  it("applies blur on entry for cinematic reveal", () => {
    const css = readIndexCss();
    expect(css).toContain("blur(4px)");
    expect(css).toContain("blur(0)");
  });
});

describe("PrismBadge", () => {
  const src = readComponent("PrismBadge");

  it("exports a PrismBadge function component", () => {
    expect(src).toContain("export function PrismBadge");
  });

  it("supports live/static/ghost variants", () => {
    expect(src).toContain('"live"');
    expect(src).toContain('"static"');
    expect(src).toContain('"ghost"');
  });

  it("supports xs/sm/md size presets", () => {
    expect(src).toContain('"xs"');
    expect(src).toContain('"sm"');
    expect(src).toContain('"md"');
  });

  it("uses conic-gradient for holographic effect", () => {
    expect(readIndexCss()).toContain("conic-gradient");
    expect(src).toContain("prism-holo-layer");
  });

  it("uses @property for animatable CSS angle", () => {
    const css = readIndexCss();
    expect(css).toContain("@property");
    expect(css).toContain("<angle>");
  });

  it("applies frosted overlay for text legibility", () => {
    const css = readIndexCss();
    expect(src).toContain("prism-frost");
    expect(css).toContain("backdrop-filter: blur(2px)");
  });

  it("uses mono font with uppercase tracking for labels", () => {
    expect(src).toContain("font-mono");
    expect(src).toContain("uppercase");
    expect(src).toContain("tracking-");
  });

  it("renders specular edge highlight", () => {
    const css = readIndexCss();
    expect(src).toContain("prism-specular-edge");
    expect(css).toContain("rgba(255, 255, 255, 0.4)");
    expect(css).toContain("inset 0 1px 0");
  });

  it("uses data-circular for border-radius exception", () => {
    expect(src).toContain("data-circular");
  });

  it("includes reduced-motion guard", () => {
    const css = readIndexCss();
    expect(css).toContain("prefers-reduced-motion");
    expect(src).toContain("prism-holo-animated");
  });

  it("supports dark mode color adjustments", () => {
    expect(readIndexCss()).toContain(".dark .prism-badge-surface");
  });
});

describe("VoidButton", () => {
  const src = readComponent("VoidButton");

  it("exports a VoidButton function component", () => {
    expect(src).toContain("export function VoidButton");
  });

  it("supports primary/secondary variants", () => {
    expect(src).toContain('"primary"');
    expect(src).toContain('"secondary"');
  });

  it("supports sm/md/lg size presets", () => {
    expect(src).toContain('"sm"');
    expect(src).toContain('"md"');
    expect(src).toContain('"lg"');
  });

  it("uses uppercase tracking for premium label style", () => {
    expect(src).toContain("uppercase");
    expect(src).toContain("tracking-");
  });

  it("renders event-horizon radial gradient background", () => {
    const css = readIndexCss();
    expect(css).toContain("radial-gradient");
    expect(src).toContain("void-bg");
  });

  it("has gravitational warp ring that expands on hover", () => {
    const css = readIndexCss();
    expect(src).toContain("void-warp-ring");
    expect(css).toContain("scale(0.5)");
    expect(css).toContain("scale(2.2)");
  });

  it("uses spring-like overshoot easing for physics feel", () => {
    const css = readIndexCss();
    expect(css).toContain("cubic-bezier(0.34, 1.56, 0.64, 1)");
  });

  it("renders surface shimmer stripe animation", () => {
    const css = readIndexCss();
    expect(src).toContain("void-shimmer-stripe");
    expect(css).toContain("void-shimmer-sweep");
  });

  it("includes focus-visible ring for keyboard users", () => {
    expect(src).toContain("focus-visible:ring-2");
  });

  it("supports disabled state with grayscale", () => {
    expect(src).toContain("disabled:opacity-40");
    expect(src).toContain("disabled:grayscale");
  });

  it("includes reduced-motion guard", () => {
    const css = readIndexCss();
    expect(css).toContain("prefers-reduced-motion");
    expect(src).toContain("void-button");
  });

  it("renders inner specular corona on hover", () => {
    const css = readIndexCss();
    expect(src).toContain("void-corona");
    expect(src).toContain("group-hover:opacity-100");
    expect(css).toContain("rgba(255, 255, 255, 0.2)");
  });
});

describe("SignalThread", () => {
  const src = readComponent("SignalThread");

  it("exports a SignalThread function component", () => {
    expect(src).toContain("export function SignalThread");
  });

  it("supports all 4 flow directions", () => {
    expect(src).toContain('"left-to-right"');
    expect(src).toContain('"right-to-left"');
    expect(src).toContain('"top-to-bottom"');
    expect(src).toContain('"bottom-to-top"');
  });

  it("clamps pulse count between 1 and 6", () => {
    expect(src).toContain("Math.max(1, Math.min(6, pulses))");
  });

  it("supports brand/emerald/rose/muted color themes", () => {
    expect(src).toContain('"brand"');
    expect(src).toContain('"emerald"');
    expect(src).toContain('"rose"');
    expect(src).toContain('"muted"');
  });

  it("generates Bézier curve paths using seeded RNG", () => {
    expect(src).toContain("seededRng");
    expect(src).toContain("generatePath");
    expect(src).toContain(" C ");
  });

  it("uses SVG animateMotion for pulse travel", () => {
    expect(src).toContain("<animateMotion");
    expect(src).toContain("repeatCount");
  });

  it("applies gaussian blur filter for glow effect", () => {
    expect(src).toContain("<feGaussianBlur");
    expect(src).toContain("signal-glow-");
  });

  it("is aria-hidden for accessibility", () => {
    expect(src).toContain('aria-hidden="true"');
  });

  it("includes reduced-motion guard", () => {
    const css = readIndexCss();
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain(".signal-thread-pulse");
  });

  it("staggers pulse timing by distributing begin offsets", () => {
    expect(src).toContain("(i / pulseCount) * speed");
  });

  it("renders trailing glow circles alongside core pulses", () => {
    expect(src).toContain("signal-thread-pulse");
    expect(src).toContain('opacity="0.3"');
  });

  it("uses configurable tension for curve variance", () => {
    expect(src).toContain("tension");
    expect(src).toContain("variance");
  });
});
