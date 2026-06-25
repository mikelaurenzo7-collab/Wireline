import { wirelineTokenValues as token } from "./generated-design-tokens";

/*
 * Wireline Design Tokens — compatibility manifest and strategy layer.
 *
 * Source of truth: design-tokens/wireline.tokens.json
 * Generated runtime artifacts: src/styles/tokens.generated.css and
 * src/constants/generated-design-tokens.ts.
 *
 * This compatibility object intentionally retains existing imports while
 * redirecting color decisions to stable semantic token paths.
 */
export const BRAND = {
  colors: {
    primary: token["color.action.primary.default"],
    primaryVariant: token["color.action.primary.pressed"],
    onPrimary: token["color.text.onAction"],

    surface: token["color.surface.default"],
    surfaceContainerLowest: token["color.surface.default"],
    surfaceContainerLow: token["color.surface.subtle"],
    surfaceContainer: token["color.surface.container"],
    surfaceContainerHigh: token["color.surface.strong"],
    surfaceContainerHighest: token["color.surface.strong"],

    onSurface: token["color.text.primary"],
    onSurfaceVariant: token["color.text.secondary"],
    onSurfaceMuted: token["color.text.secondary"],

    outline: token["color.border.strong"],
    outlineVariant: token["color.border.default"],
    line: token["color.border.default"],

    success: token["color.status.success"],
    warning: token["color.status.warning"],
    error: token["color.status.error"],
  },

  spacing: {
    base: token["space.050"],
    scale: "semantic 4px rhythm with fluid layout allowances",
    strategy:
      "Strict semantic spacing steps with fluid layout only where a route needs responsive breathing room.",
    component: `${token["space.200"]} | ${token["space.300"]}`,
    section: "clamp(3rem, 2rem + 5vw, 6rem)",
  },

  typography: {
    display: `${token["font.family.display"]} — sharp display typography for Wireline headings`,
    body: `${token["font.family.body"]} — neutral, highly legible interface copy`,
    mono: `${token["font.family.mono"]} — metadata, status, and technical labels`,
    scale: "Fluid modular steps with clamp() for responsive hierarchy",
    headingStrategy:
      "Short, single-layer headings only. Concise and purposeful across the app shell.",
    // Full semantic scale from tokens for perfect cross-surface symmetry
    sizes: {
      display: token["typography.display.size"],
      h1: token["typography.h1.size"],
      h2: token["typography.h2.size"],
      h3: token["typography.h3.size"],
      body: token["typography.body.size"],
      caption: token["typography.caption.size"],
      overline: token["typography.overline.size"],
    },
  },

  elevation: {
    strategy:
      "Subtle tonal layering and restrained box-shadow. Avoid excessive glow, noise, or glassmorphism.",
    card: "0 1px 3px rgba(0,0,0,0.05) + subtle border",
    panel: "0 2px 8px rgba(93,63,211,0.06)",
    modal: "0 10px 25px -5px rgba(93,63,211,0.08)",
  },

  zIndex: {
    base: token["zIndex.base"],
    dropdown: token["zIndex.dropdown"],
    modal: token["zIndex.modal"],
    tooltip: token["zIndex.tooltip"],
  },

  radius: {
    base: token["radius.sm"],
    sm: token["radius.sm"],
    md: token["radius.md"],
    lg: token["radius.lg"],
    xl: token["radius.xl"],
    pill: token["radius.pill"],
    note: "4px inputs/controls (sm), 6px compact (md), 8px standard cards/buttons (lg), 16px larger panels (xl). Pills reserved for status/avatars. Sourced from design-tokens/wireline.tokens.json via generated wirelineTokenValues.",
  },

  accessibility: {
    contrastStandard: "WCAG 2.2 AA minimum; target AAA where content and brand constraints permit.",
    dynamicApproach: "Static high-contrast baseline with room for future perceptual tooling.",
    targetSize: "Minimum 24×24px for compact controls; 44px target for primary touch actions.",
    reducedMotion: "Respect prefers-reduced-motion globally",
  },

  theming: {
    current: "Light operator-grade baseline with tonal layering",
    planned: "High-contrast mode plus density variants via semantic token sets",
  },

  governance:
    "Changes require a semantic-token review, accessibility validation, generated artifact refresh, and consumer adoption in the same pull request.",
  pipeline:
    "DTCG-style JSON source -> dependency-free generator -> CSS custom properties and typed TypeScript. Native adapters follow once their consumers are active.",
} as const;

export type BrandTokenCategory = keyof typeof BRAND;
export type BrandColorToken = keyof typeof BRAND.colors;
