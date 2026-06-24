/*
 * Wireline Design Tokens — TypeScript manifest and strategy layer.
 *
 * Role in token management:
 * - Authoritative reference for token categories, scaling strategy, and usage guidance.
 * - TypeScript DX layer paired with the live CSS custom property runtime.
 * - Foundation for future export pipelines such as DTCG JSON or Style Dictionary.
 *
 * Governance:
 * - Keep this manifest aligned with the CSS runtime token layer.
 * - Prefer semantic naming, strong contrast, and restrained operator-grade surfaces.
 * - When runtime values change, update this manifest so the repo does not drift.
 */

export const BRAND = {
  colors: {
    primary: "#5D3FD3",
    primaryVariant: "#451EBB",
    onPrimary: "#FFFFFF",

    surface: "#FFFFFF",
    surfaceContainerLowest: "#FFFFFF",
    surfaceContainerLow: "#F1F5F9",
    surfaceContainer: "#E5EEFF",
    surfaceContainerHigh: "#DCE9FF",
    surfaceContainerHighest: "#D3E4FE",

    onSurface: "#0F172A",
    onSurfaceVariant: "#334155",
    onSurfaceMuted: "#475569",

    outline: "#94A3B8",
    outlineVariant: "#CBD5E1",
    line: "#CBD5E1",

    success: "#166534",
    warning: "#854D0E",
    error: "#991B1B",
  },

  spacing: {
    base: "4px",
    scale: "multiplicative + fluid clamp()",
    strategy:
      "Strict 4px rhythm with fluid scaling for layout, typography, and responsive spacing.",
    component: "16px | 24px",
    section: "clamp(3rem, 2rem + 5vw, 6rem)",
  },

  typography: {
    display: "Hanken Grotesk — sharp display typography for Wireline headings",
    body: "Inter — neutral, highly legible interface copy",
    mono: "JetBrains Mono — metadata, status, and technical labels",
    scale: "Fluid modular steps with clamp() for responsive hierarchy",
    headingStrategy:
      "Short, single-layer headings only. Concise and purposeful across the app shell.",
  },

  elevation: {
    strategy:
      "Subtle tonal layering and restrained box-shadow. Avoid excessive glow, noise, or glassmorphism.",
    card: "0 1px 3px rgba(0,0,0,0.05) + subtle border",
    panel: "0 2px 8px rgba(93,63,211,0.06)",
    modal: "0 10px 25px -5px rgba(93,63,211,0.08)",
  },

  radius: {
    base: "4px",
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    pill: "999px",
    note: "AGENTS.md: 4px inputs/controls, 8px standard cards/buttons, 12px larger modals/panels. Pills for status and avatars only.",
  },

  accessibility: {
    contrastStandard: "WCAG 2.2 AAA (7:1 normal, 4.5:1 large)",
    dynamicApproach: "Static high-contrast baseline with room for future perceptual tooling.",
    targetSize: "Minimum 24×24px for interactive elements",
    reducedMotion: "Respect prefers-reduced-motion globally",
  },

  theming: {
    current: "Light operator-grade baseline with tonal layering",
    planned: "High-contrast mode plus density variants via semantic token sets",
  },

  governance:
    "Changes require review against Wireline brand direction, accessibility, and runtime consistency.",
  pipeline:
    "Current: manual sync. Future: shared token source with generated CSS, TS, and design-tool outputs.",
} as const;

export type BrandTokenCategory = keyof typeof BRAND;
export type BrandColorToken = keyof typeof BRAND.colors;
