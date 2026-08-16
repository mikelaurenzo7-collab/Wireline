import { wirelineTokenValues as token } from "./generated-design-tokens";

/*
 * Wireline Letterpress compatibility manifest.
 *
 * Runtime source of truth: generated semantic token artifacts.
 * This object keeps older imports alive while redirecting visual decisions
 * to the generated Letterpress token system.
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
      "Strict semantic spacing with fluid layout only where responsive breathing room is necessary.",
    component: `${token["space.200"]} | ${token["space.300"]}`,
    section: "clamp(3rem, 2rem + 5vw, 6rem)",
  },

  typography: {
    display: `${token["font.family.display"].replace(/"/g, "")}: editorial interface headings`,
    body: `${token["font.family.body"].replace(/"/g, "")}: neutral, highly legible interface copy`,
    mono: `${token["font.family.mono"].replace(/"/g, "")}: metadata, status, and technical labels`,
    scale: "Fluid modular steps with clamp() for responsive hierarchy",
    headingStrategy:
      "Short, single-layer headings only. Concise and purposeful across the app shell.",
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
      "Subtle paper layering. Avoid glassmorphism, noisy gradients, and decorative shadow color.",
    card: token["elevation.sm"],
    panel: token["elevation.md"],
    modal: token["elevation.lg"],
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
    note: "Letterpress geometry sourced from generated Wireline tokens.",
  },

  accessibility: {
    contrastStandard:
      "WCAG 2.2 AA minimum; target AAA where content and product constraints permit.",
    dynamicApproach: "Static high-contrast baseline with room for future perceptual tooling.",
    targetSize: "Minimum 24×24px for compact controls; 44px target for primary touch actions.",
    reducedMotion: "Respect prefers-reduced-motion globally",
  },

  theming: {
    current: "Wireline Letterpress light operating baseline",
    planned: "High-contrast mode plus density variants via semantic token sets",
  },

  governance:
    "Changes require semantic-token review, accessibility validation, generated artifact refresh, and consumer adoption in the same pull request.",
  pipeline:
    "DTCG-style JSON source -> dependency-free generator -> CSS custom properties and typed TypeScript. Native adapters follow once active.",
} as const;

export type BrandTokenCategory = keyof typeof BRAND;
export type BrandColorToken = keyof typeof BRAND.colors;
