# Wireline Theme and Design Tokens

## Compact token summary

- Identity: Aurora Letterpress — near-black violet canvases, layered charcoal-violet surfaces, electric lavender actions, silver secondary controls, and restrained semantic status colors.
- Dark canvas: default #0A0A0E, deeper #050508, warmer #101018.
- Dark surfaces: subtle #100F15, default #141319, container #18161E, raised #201E29, strong #262330.
- Dark text: primary #F5F4F8, secondary #B6B1C6, tertiary #8B87A0.
- Primary action: default #A78BFA, hover #C4B5FD, pressed #8B5CF6, container #1E1730.
- Status: success #4ADE9A, warning #E8B85C, error #EF7B92, info #93A0C7.
- Light mode: canvas #F6F5FA, surface #FFFFFF, text #171426, primary #6D28D9. The html.light class is the only override; dark is the default absence of that class.
- Type: Inter for body, Inter Tight for display, IBM Plex Mono for operational data. Display 56/60 at 720; H1 40/46 at 700; H2 30/36 at 680; H3 22/30 at 650; body 16/26; caption 13/19; overline 11/16 with 0.09em tracking.
- Spacing: 2, 4, 6, 8, 10, 12, 16, 24, 32, 40, 48, 64px. Standard section gap 48px.
- Radius: 6, 8, 10, 12, 20, 28px and pill. Product surfaces favor restrained 10–12px radii.
- Layout: authenticated content max 1152px; marketing rail 1088px; touch targets 40px minimum, 44px comfortable, 48px primary.
- Motion: 60, 120, 200, 300, and 440ms with the Wireline emphasized curve cubic-bezier(0.22, 1, 0.36, 1). Reduced motion is honored by the component layers.
- Elevation: minimal 1–2px definition plus low-opacity long shadows; violet and silver focus/identity rings are semantic tokens.
- Breakpoints: Tailwind CSS 4 defaults are used; project responsive terminal layers concentrate on 767px mobile and standard tablet/desktop utility breakpoints.

## CSS architecture

There is no tailwind.config file. Tailwind CSS 4 is loaded through the Vite plugin and configured inline in src/index.css. Import order in that file is part of the executable design contract.

## Raw source: src/styles/tokens.generated.css

~~~css
/* Generated from design-tokens/wireline.tokens.json. Do not edit by hand. */
:root {
  --wireline-color-action-primary-container: #1E1730;
  --wireline-color-action-primary-containerStrong: #2E2350;
  --wireline-color-action-primary-default: #A78BFA;
  --wireline-color-action-primary-hover: #C4B5FD;
  --wireline-color-action-primary-pressed: #8B5CF6;
  --wireline-color-action-secondary-container: #1C1D22;
  --wireline-color-action-secondary-containerStrong: #2B2C33;
  --wireline-color-action-secondary-default: #C7CCD6;
  --wireline-color-action-secondary-hover: #DEE1E8;
  --wireline-color-action-secondary-pressed: #A9AFBC;
  --wireline-color-border-default: #262430;
  --wireline-color-border-soft: #1C1A22;
  --wireline-color-border-strong: #3A3745;
  --wireline-color-canvas-deeper: #050508;
  --wireline-color-canvas-default: #0A0A0E;
  --wireline-color-canvas-warmer: #101018;
  --wireline-color-feedback-error-border: #4C2836;
  --wireline-color-feedback-error-surface: #271620;
  --wireline-color-feedback-info-border: #33364E;
  --wireline-color-feedback-info-surface: #171928;
  --wireline-color-feedback-neutral-border: #302D3B;
  --wireline-color-feedback-neutral-surface: #18161F;
  --wireline-color-feedback-success-border: #2B4A3A;
  --wireline-color-feedback-success-surface: #12211A;
  --wireline-color-feedback-warning-border: #4C3C1E;
  --wireline-color-feedback-warning-surface: #251E12;
  --wireline-color-focus-default: #A78BFA;
  --wireline-color-focus-wire: #C7CCD6;
  --wireline-color-glow-primary: rgba(167, 139, 250, 0.22);
  --wireline-color-glow-primarySoft: rgba(167, 139, 250, 0.10);
  --wireline-color-glow-wire: rgba(199, 204, 214, 0.20);
  --wireline-color-glow-wireSoft: rgba(199, 204, 214, 0.08);
  --wireline-color-overlay-scrim: rgba(4, 4, 7, 0.7);
  --wireline-color-overlay-vignette: rgba(8, 7, 12, 0.34);
  --wireline-color-pressHighlight: rgba(255, 255, 255, 0.05);
  --wireline-color-status-error: #EF7B92;
  --wireline-color-status-info: #93A0C7;
  --wireline-color-status-neutral: #A29DB0;
  --wireline-color-status-success: #4ADE9A;
  --wireline-color-status-warning: #E8B85C;
  --wireline-color-surface-container: #18161E;
  --wireline-color-surface-default: #141319;
  --wireline-color-surface-raised: #201E29;
  --wireline-color-surface-recessed: #08070B;
  --wireline-color-surface-strong: #262330;
  --wireline-color-surface-subtle: #100F15;
  --wireline-color-text-onAction: #0E0B16;
  --wireline-color-text-primary: #F5F4F8;
  --wireline-color-text-secondary: #B6B1C6;
  --wireline-color-text-tertiary: #8B87A0;
  --wireline-elevation-card: 0 8px 24px -16px rgba(0, 0, 0, 0.6);
  --wireline-elevation-inset: inset 0 1px 0 rgba(255, 255, 255, 0.05), inset 0 -1px 0 rgba(0, 0, 0, 0.4);
  --wireline-elevation-insetRaised: inset 0 1px 0 rgba(255, 255, 255, 0.07), inset 0 -1px 0 rgba(0, 0, 0, 0.5);
  --wireline-elevation-lg: 0 28px 70px -44px rgba(0, 0, 0, 0.72);
  --wireline-elevation-md: 0 14px 34px -26px rgba(0, 0, 0, 0.66);
  --wireline-elevation-raised: 0 2px 8px -3px rgba(0, 0, 0, 0.5);
  --wireline-elevation-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --wireline-elevation-wireGlow: 0 0 0 1px rgba(199, 204, 214, 0.22), 0 8px 30px -12px rgba(199, 204, 214, 0.28);
  --wireline-elevation-wirelineRing: 0 0 0 1px rgba(167, 139, 250, 0.18), 0 8px 30px -12px rgba(167, 139, 250, 0.20);
  --wireline-elevation-xs: 0 1px 1px rgba(0, 0, 0, 0.32);
  --wireline-font-family-body: "Inter";
  --wireline-font-family-display: "Inter Tight";
  --wireline-font-family-mono: "IBM Plex Mono";
  --wireline-interaction-focus-haloWidth: 4px;
  --wireline-interaction-focus-offset: 2px;
  --wireline-interaction-focus-width: 2px;
  --wireline-interaction-target-comfortable: 44px;
  --wireline-interaction-target-minimum: 40px;
  --wireline-interaction-target-primary: 48px;
  --wireline-layout-contentMax: 1152px;
  --wireline-layout-marketingRail: 1088px;
  --wireline-layout-sectionGap: 48px;
  --wireline-motion-duration-deliberate: 440ms;
  --wireline-motion-duration-fast: 120ms;
  --wireline-motion-duration-instant: 60ms;
  --wireline-motion-duration-slow: 300ms;
  --wireline-motion-duration-standard: 200ms;
  --wireline-motion-easing-accelerate: cubic-bezier(0.4, 0, 1, 1);
  --wireline-motion-easing-decelerate: cubic-bezier(0, 0, 0.2, 1);
  --wireline-motion-easing-emphasized: cubic-bezier(0.16, 1, 0.3, 1);
  --wireline-motion-easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --wireline-motion-easing-standard: cubic-bezier(0.2, 0, 0, 1);
  --wireline-motion-easing-wireline: cubic-bezier(0.22, 1, 0.36, 1);
  --wireline-motion-lift: 1px;
  --wireline-motion-press: 0.985;
  --wireline-radius-2xl: 28px;
  --wireline-radius-lg: 12px;
  --wireline-radius-md: 10px;
  --wireline-radius-pill: 999px;
  --wireline-radius-sm: 8px;
  --wireline-radius-xl: 20px;
  --wireline-radius-xs: 6px;
  --wireline-space-025: 2px;
  --wireline-space-050: 4px;
  --wireline-space-075: 6px;
  --wireline-space-100: 8px;
  --wireline-space-125: 10px;
  --wireline-space-150: 12px;
  --wireline-space-200: 16px;
  --wireline-space-300: 24px;
  --wireline-space-400: 32px;
  --wireline-space-500: 40px;
  --wireline-space-600: 48px;
  --wireline-space-800: 64px;
  --wireline-typography-body-letterSpacing: -0.005em;
  --wireline-typography-body-lineHeight: 26px;
  --wireline-typography-body-size: 16px;
  --wireline-typography-body-weight: 400;
  --wireline-typography-bodyStrong-letterSpacing: -0.005em;
  --wireline-typography-bodyStrong-lineHeight: 26px;
  --wireline-typography-bodyStrong-size: 16px;
  --wireline-typography-bodyStrong-weight: 650;
  --wireline-typography-caption-letterSpacing: 0em;
  --wireline-typography-caption-lineHeight: 19px;
  --wireline-typography-caption-size: 13px;
  --wireline-typography-caption-weight: 500;
  --wireline-typography-display-letterSpacing: -0.045em;
  --wireline-typography-display-lineHeight: 60px;
  --wireline-typography-display-size: 56px;
  --wireline-typography-display-weight: 720;
  --wireline-typography-h1-letterSpacing: -0.04em;
  --wireline-typography-h1-lineHeight: 46px;
  --wireline-typography-h1-size: 40px;
  --wireline-typography-h1-weight: 700;
  --wireline-typography-h2-letterSpacing: -0.035em;
  --wireline-typography-h2-lineHeight: 36px;
  --wireline-typography-h2-size: 30px;
  --wireline-typography-h2-weight: 680;
  --wireline-typography-h3-letterSpacing: -0.025em;
  --wireline-typography-h3-lineHeight: 30px;
  --wireline-typography-h3-size: 22px;
  --wireline-typography-h3-weight: 650;
  --wireline-typography-overline-letterSpacing: 0.09em;
  --wireline-typography-overline-lineHeight: 16px;
  --wireline-typography-overline-size: 11px;
  --wireline-typography-overline-weight: 700;
  --wireline-zIndex-base: 0;
  --wireline-zIndex-dropdown: 1000;
  --wireline-zIndex-fixed: 1030;
  --wireline-zIndex-modal: 1050;
  --wireline-zIndex-modalBackdrop: 1040;
  --wireline-zIndex-popover: 1060;
  --wireline-zIndex-sticky: 1020;
  --wireline-zIndex-tooltip: 1070;
}
~~~

## Raw source: src/styles/theme-light.css

~~~css
/* Wireline Letterpress — Aurora light appearance (optional light mode).
 * Default tokens in tokens.generated.css are the dark Aurora canvas. Apply
 * `.light` on `html` to swap semantic colors for a cool, near-white surface
 * that keeps the same violet/silver identity as dark mode, inverted for
 * contrast: a deeper, more saturated violet carries the action color so
 * white text still holds AA contrast on a light background. */

:root.light {
  color-scheme: light;

  --wireline-color-canvas-default: #f6f5fa;
  --wireline-color-canvas-deeper: #eae8f2;
  --wireline-color-canvas-warmer: #fbfafd;
  --wireline-color-surface-default: #ffffff;
  --wireline-color-surface-subtle: #f1eff7;
  --wireline-color-surface-container: #e9e6f1;
  --wireline-color-surface-strong: #dedaea;
  --wireline-color-surface-raised: #ffffff;
  --wireline-color-surface-recessed: #eceaf3;

  --wireline-color-text-primary: #171426;
  --wireline-color-text-secondary: #5b5770;
  /* 4.69:1 on the light canvas and 5.09:1 on white: AA-safe for small metadata. */
  --wireline-color-text-tertiary: #706b84;
  --wireline-color-text-onAction: #ffffff;

  --wireline-color-action-primary-default: #6d28d9;
  --wireline-color-action-primary-pressed: #5b21b6;
  --wireline-color-action-primary-hover: #7c3aed;
  --wireline-color-action-primary-container: #ede7fb;
  --wireline-color-action-primary-containerStrong: #dcd0f7;

  --wireline-color-action-secondary-default: #6b7280;
  --wireline-color-action-secondary-pressed: #4b5563;
  --wireline-color-action-secondary-hover: #808895;
  --wireline-color-action-secondary-container: #eef0f3;
  --wireline-color-action-secondary-containerStrong: #dfe3e8;

  --wireline-color-border-default: #e1deea;
  --wireline-color-border-soft: #eceaf3;
  --wireline-color-border-strong: #c9c4d9;

  --wireline-color-focus-default: #6d28d9;
  --wireline-color-focus-wire: #6b7280;

  --wireline-color-overlay-scrim: rgba(23, 20, 38, 0.42);
  --wireline-color-overlay-vignette: rgba(23, 20, 38, 0.12);

  /* Darkened so status text clears WCAG AA (4.5:1) on both the near-white
     canvas and the tinted feedback surfaces below. The prior values were
     3.1-4.4:1 as small text; hues are preserved. */
  --wireline-color-status-success: #127548;
  --wireline-color-status-warning: #8a5c07;
  --wireline-color-status-error: #b83648;
  --wireline-color-status-info: #46577a;
  --wireline-color-status-neutral: #6b6678;

  --wireline-color-feedback-success-surface: #e7f5ec;
  --wireline-color-feedback-success-border: #b7dec5;
  --wireline-color-feedback-warning-surface: #fbf0dc;
  --wireline-color-feedback-warning-border: #e7ce9c;
  --wireline-color-feedback-error-surface: #fbe7ea;
  --wireline-color-feedback-error-border: #e7b7c0;
  --wireline-color-feedback-info-surface: #e9ebf3;
  --wireline-color-feedback-info-border: #c3c9dc;
  --wireline-color-feedback-neutral-surface: #efedf4;
  --wireline-color-feedback-neutral-border: #d8d4e3;

  --wireline-color-glow-primary: rgba(109, 40, 217, 0.12);
  --wireline-color-glow-primarySoft: rgba(109, 40, 217, 0.06);
  --wireline-color-glow-wire: rgba(107, 114, 128, 0.10);
  --wireline-color-glow-wireSoft: rgba(107, 114, 128, 0.04);

  --wireline-color-pressHighlight: rgba(23, 20, 38, 0.04);

  --wireline-elevation-sm: 0 1px 2px rgba(23, 20, 38, 0.06);
  --wireline-elevation-xs: 0 1px 1px rgba(23, 20, 38, 0.04);
  --wireline-elevation-card: 0 8px 24px -16px rgba(23, 20, 38, 0.12);
  --wireline-elevation-md: 0 14px 34px -26px rgba(23, 20, 38, 0.14);
  --wireline-elevation-lg: 0 28px 70px -44px rgba(23, 20, 38, 0.18);
  --wireline-elevation-raised: 0 2px 8px -3px rgba(23, 20, 38, 0.08);
  --wireline-elevation-inset: inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 -1px 0 rgba(23, 20, 38, 0.06);
  --wireline-elevation-insetRaised: inset 0 1px 0 rgba(255, 255, 255, 0.8), inset 0 -1px 0 rgba(23, 20, 38, 0.08);
  --wireline-elevation-wirelineRing: 0 0 0 1px rgba(109, 40, 217, 0.12), 0 8px 30px -12px rgba(109, 40, 217, 0.10);
  --wireline-elevation-wireGlow: 0 0 0 1px rgba(107, 114, 128, 0.14), 0 8px 30px -12px rgba(107, 114, 128, 0.12);

  --background: var(--wireline-color-canvas-default);
  --foreground: var(--wireline-color-text-primary);
  --card: var(--wireline-color-surface-default);
  --card-foreground: var(--wireline-color-text-primary);
  --muted: var(--wireline-color-surface-subtle);
  --muted-foreground: var(--wireline-color-text-secondary);
  --border: var(--wireline-color-border-default);
  --input: var(--wireline-color-border-default);
  --ring: var(--wireline-color-focus-default);
}
~~~

## Raw source: src/index.css

~~~css
/* Typefaces are self-hosted and loaded via <link> to /fonts.css in index.html,
   so they download in parallel with the app bundle instead of chaining behind
   this stylesheet's @import — and without a cross-origin round trip. */
@import "tailwindcss";
@plugin "@tailwindcss/typography";

/* Wireline is dark-by-default: ThemeProvider (src/contexts/ThemeContext.tsx)
 * only ever toggles a `.light` class on <html> for the light/system-resolved-
 * light theme; there is no `.dark` class and dark is simply the absence of
 * `.light`. Without this override, Tailwind's `dark:` variant defaults to
 * `@media (prefers-color-scheme: dark)`, which tracks the OS/browser setting
 * instead of the theme the user actually picked in-app. Registering it here
 * makes every existing `dark:*` utility track the real resolved theme. */
@custom-variant dark (&:where(:not(.light *)));

/* Register the legacy brand/ink/paper and status color names as Tailwind
 * utilities so `text-brand`, `bg-brand`, `border-ink`, `text-paper`,
 * `text-on-brand`, `bg-destructive`, `text-success`, `bg-surface`, etc.
 * resolve to the live Letterpress tokens instead of being dropped at build
 * time. Inline so they track the same tokens as `primary`/`card`/`border`. */
@theme inline {
  --color-brand: var(--wireline-color-action-primary-default);
  --color-brand-deep: var(--wireline-color-action-primary-pressed);
  --color-brand-display: var(--wireline-color-action-primary-default);
  --color-brand-soft: var(--wireline-color-action-primary-container);
  --color-on-brand: var(--wireline-color-text-onAction);
  --color-ink: var(--wireline-color-text-primary);
  --color-paper: var(--wireline-color-canvas-default);
  --color-destructive: var(--wireline-color-status-error);
  --color-destructive-foreground: var(--wireline-color-text-onAction);
  --color-success: var(--wireline-color-status-success);
  --color-success-foreground: var(--wireline-color-text-onAction);
  --color-surface: var(--wireline-color-surface-default);
  --color-warning: var(--wireline-color-status-warning);

  /* shadcn-style semantic tokens — register here so Tailwind v4 actually
     generates `bg-primary`, `text-primary-foreground`, `bg-card`,
     `text-foreground`, `border-border`, etc. These were defined in `:root`
     (foundation.css) but never reached @theme, so the utilities were
     silently dropped — `wl-eyebrow text-primary-foreground` on the dark
     pricing badge rendered with no color override and no green background. */
  --color-background: var(--wireline-color-canvas-default);
  --color-foreground: var(--wireline-color-text-primary);
  --color-card: var(--wireline-color-surface-default);
  --color-card-foreground: var(--wireline-color-text-primary);
  --color-popover: var(--wireline-color-surface-default);
  --color-popover-foreground: var(--wireline-color-text-primary);
  --color-primary: var(--wireline-color-action-primary-default);
  --color-primary-foreground: var(--wireline-color-text-onAction);
  --color-secondary: var(--wireline-color-surface-subtle);
  --color-secondary-foreground: var(--wireline-color-text-primary);
  --color-muted: var(--wireline-color-surface-subtle);
  --color-muted-foreground: var(--wireline-color-text-secondary);
  --color-accent: var(--wireline-color-action-primary-container);
  --color-accent-foreground: var(--wireline-color-text-primary);
  --color-border: var(--wireline-color-border-default);
  --color-input: var(--wireline-color-border-default);
  --color-ring: var(--wireline-color-focus-default);

  /* Redirect raw Tailwind rose/amber status utilities to the Wireline
   * status tokens so every error/danger surface (DNC, usage overage,
   * delete actions, status pills) and every warning surface (low credit,
   * usage threshold) reads as the single canonical Wireline error/warning
   * color — not Tailwind's generic rose/amber ramp. Opacity modifiers
   * (rose-500/10, amber-500/8) still create lightness variation via
   * color-mix, so backgrounds and borders keep their depth. This fixes
   * 300+ raw rose/amber usages across 8+ components without touching a
   * single component file. */
  --color-rose-300: var(--wireline-color-status-error);
  --color-rose-400: var(--wireline-color-status-error);
  --color-rose-500: var(--wireline-color-status-error);
  --color-rose-600: var(--wireline-color-status-error);
  --color-rose-700: var(--wireline-color-status-error);
  --color-amber-200: var(--wireline-color-status-warning);
  --color-amber-400: var(--wireline-color-status-warning);
  --color-amber-500: var(--wireline-color-status-warning);
  --color-amber-600: var(--wireline-color-status-warning);
  --color-amber-800: var(--wireline-color-status-warning);
}

/* Wireline — Letterpress design system. This is the sole application CSS
 * entrypoint; tier order below is part of the executable design contract. */
@import "./styles/tokens.generated.css";
@import "./styles/foundation.css";
@import "./styles/design-system.css";
@import "./styles/typography-prose.css";
@import "./styles/components.css";
@import "./styles/stitch-patterns.css";
@import "./styles/wireline-layout-passes.css";
@import "./styles/wireline-product-surfaces.css";
@import "./styles/wireline-marketing-surfaces.css";
@import "./styles/letterpress-polish.css";
@import "./styles/visual-qa-hotfix.css";
@import "./styles/theme-light.css";
@import "./styles/system-hardening.css";
@import "./styles/system-refinement-pass-two.css";

/* Terminal responsive tiers intentionally follow the semantic system. They
 * may compact components, but must not redefine tokens or brand foundations. */
@import "./styles/responsive.css";
@import "./styles/ruthless-mobile-cleanup.css";
@import "./styles/agent-tabs-compact.css";
@import "./styles/modal-hierarchy.css";
@import "./styles/e2e-design-polish.css";
@import "./styles/prestige-polish.css";

body {
  /* `background-color`, not the `background` shorthand: this rule sits after the
     prestige-polish import, and the shorthand reset its ambient gradient to
     `none`, so that presentation layer silently did nothing. */
  background-color: var(--wireline-color-canvas-default);
  color: var(--wireline-color-text-primary);
  font-family:
    var(--wireline-font-family-body),
    "Inter",
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
  font-weight: 400;
  --wl-font-display: "Inter Tight";
  --wl-font-sans: "Inter";
  --wl-font-mono: "IBM Plex Mono";
  font-feature-settings:
    "kern" 1,
    "liga" 1,
    "calt" 1,
    "tnum" 1,
    "ss01" 1,
    "cv11" 1;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Current-production auth QA: keep compact CTA labels readable instead of novelty-spaced. */
.studio-card button[class*="tracking-[0.22em]"],
button[class*="tracking-[0.25em]"],
button[class*="tracking-[0.3em]"] {
  letter-spacing: 0.08em !important;
}

/* Mobile editing contract: 16px controls prevent Safari focus zoom, including
 * legacy forms that have not yet migrated to the shared atoms. */
@media (max-width: 767px) {
  .wl-ui-caps :where(
      input:not([type="checkbox"]):not([type="radio"]),
      select,
      textarea
    ) {
    font-size: 16px;
  }

  .wl-stitch-auth-divider {
    font-size: var(--wireline-typography-overline-size);
  }
}
~~~

## Raw source: src/constants/design-tokens.ts

~~~ts
import {
  wirelineToken,
  wirelineTokenValues,
  type WirelineTokenPath,
} from "./generated-design-tokens";

/**
 * Design-token runtime manifest.
 *
 * Source of truth: design-tokens/wireline.tokens.json
 * Generated artifacts: CSS custom properties and this typed TypeScript map.
 *
 * The JSON format intentionally follows DTCG-style `$type` / `$value` leaves,
 * so Tokens Studio, Style Dictionary, and native platform adapters can be
 * introduced without changing application-facing semantic paths.
 */
export const DESIGN_TOKENS = {
  source: "design-tokens/wireline.tokens.json",
  format: "dtcg-json -> css-custom-properties + typed-typescript",
  values: wirelineTokenValues,
  get: wirelineToken,
  toJSON: () => ({ ...wirelineTokenValues }),
} as const;

export { wirelineToken, wirelineTokenValues };
export type { WirelineTokenPath };
~~~

## Raw source: src/contexts/ThemeContext.tsx

~~~tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "wireline-theme";
const THEME_COLORS = {
  dark: "#0A0A0E",
  light: "#F6F5FA",
} as const;

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: "light" | "dark";
  setTheme: (next: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    /* ignore */
  }
  return "dark";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return true;
  return window.matchMedia?.("(prefers-color-scheme: dark)")?.matches ?? true;
}

function resolveTheme(theme: Theme, systemDark: boolean): "light" | "dark" {
  if (theme === "system") return systemDark ? "dark" : "light";
  return theme;
}

function updateMetaContent(name: string, content: string): void {
  const meta = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (meta) meta.content = content;
}

function applyResolvedTheme(resolved: "light" | "dark"): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle("light", resolved === "light");
  root.style.colorScheme = resolved;
  updateMetaContent("color-scheme", resolved);
  updateMetaContent("theme-color", THEME_COLORS[resolved]);
  updateMetaContent("msapplication-TileColor", THEME_COLORS[resolved]);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readStoredTheme());
  const [systemDark, setSystemDark] = useState(() => systemPrefersDark());
  const resolvedTheme = useMemo(() => resolveTheme(theme, systemDark), [theme, systemDark]);

  useEffect(() => {
    applyResolvedTheme(resolvedTheme);
  }, [resolvedTheme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  return (
    context ?? {
      theme: "dark",
      resolvedTheme: "dark",
      setTheme: () => {},
      toggleTheme: () => {},
    }
  );
}
~~~
