/*
 * Ametrine Precision Design Tokens — TypeScript Manifest & Strategy
 * Professional Enterprise Standard | Single Source of Strategy & DX Layer
 *
 * Role in Token Management:
 * - Authoritative reference for token categories, scaling strategy, and professional usage guidelines.
 * - TypeScript types and developer DX layer (values synchronized to CSS custom properties in foundation.css).
 * - Foundation for future automated pipeline (exportable to DTCG JSON, Style Dictionary, Figma Variables).
 *
 * Governance: All token additions/changes must align with design-system.css management section, maintain AAA contrast, and use professional tone.
 * Sync Process: Update this manifest first for strategy/types, then mirror runtime values to CSS :root. Audit for consistency and AAA before merge.
 */

export const BRAND = {
  // ============================================
  // COLOR TOKENS — Professional AAA Baseline
  // ============================================
  colors: {
    primary: '#451EBB',
    primaryVariant: '#5D3FD3',
    onPrimary: '#FFFFFF',

    // Surface system (light professional)
    surface: '#FFFFFF',
    surfaceContainerLowest: '#FFFFFF',
    surfaceContainerLow: '#F1F5F9',      // AAA-refined
    surfaceContainer: '#E5EEFF',
    surfaceContainerHigh: '#DCE9FF',
    surfaceContainerHighest: '#D3E4FE',

    // Text / on-surface (WCAG 2.2 AAA enforced)
    onSurface: '#0F172A',                 // ~12:1+ contrast
    onSurfaceVariant: '#334155',          // 7:1+ contrast
    onSurfaceMuted: '#475569',

    // Supporting
    outline: '#94A3B8',
    outlineVariant: '#CBD5E1',
    line: '#CBD5E1',

    // Status (professional, high contrast)
    success: '#166534',
    warning: '#854D0E',
    error: '#991B1B',
  },

  // ============================================
  // SPACING & RHYTHM — 4px Mathematical + Fluid
  // ============================================
  spacing: {
    base: '4px',
    scale: 'multiplicative + fluid clamp()',
    strategy: 'Strict 4px grid for precision and alignment. Fluid clamp() for containers, typography, and responsive rhythm.',
    component: '16px | 24px',
    section: 'clamp(3rem, 2rem + 5vw, 6rem)',
  },

  // ============================================
  // TYPOGRAPHY — Professional, Legible, Precise
  // ============================================
  typography: {
    display: 'Hanken Grotesk — sharp, professional display face',
    body: 'Inter — highly legible, neutral body copy',
    mono: 'JetBrains Mono — precise metadata and code',
    scale: 'Fluid modular steps with clamp() for responsive harmony',
    headingStrategy: 'Short, single-layer headings only. Concise and purposeful. Enforced app-wide.',
  },

  // ============================================
  // ELEVATION & DEPTH — Tonal & Restrained (Professional)
  // ============================================
  elevation: {
    strategy: 'Subtle tonal layering and restrained box-shadow via color-mix(). Avoid excessive glow or glassmorphism for professional clarity.',
    card: '0 1px 3px rgba(0,0,0,0.05) + subtle border',
    panel: '0 2px 8px rgba(93,63,211,0.06)',
    modal: '0 10px 25px -5px rgba(93,63,211,0.08)',
  },

  // ============================================
  // RADIUS & SHAPE — Consistent Professional Geometry
  // ============================================
  radius: {
    base: '4px',
    sm: '2px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    pill: '999px',
  },

  // ============================================
  // ACCESSIBILITY & DYNAMIC CONTRAST
  // ============================================
  accessibility: {
    contrastStandard: 'WCAG 2.2 AAA (7:1 normal, 4.5:1 large)',
    dynamicApproach: 'Static AAA hex baseline enforced. APCA recommended for any future perceptual/dynamic tooling.',
    targetSize: 'Minimum 24×24px for interactive elements',
    reducedMotion: 'Respect prefers-reduced-motion globally',
  },

  // ============================================
  // THEMING & MODES (Future-Ready)
  // ============================================
  theming: {
    current: 'Light professional baseline with tonal layering',
    planned: 'High-contrast mode + density variants (compact/comfortable) via additional semantic token sets',
  },

  // ============================================
  // GOVERNANCE & PIPELINE NOTES
  // ============================================
  governance: 'Changes require review against professional tone, AAA contrast, and this manifest. See design-system.css for full management workflow.',
  pipeline: 'Current: Manual sync (lean & auditable). Future: Single DTCG JSON source + Style Dictionary generation for CSS, TS types, and design tool sync.',
} as const;

export type BrandTokenCategory = keyof typeof BRAND;

export type BrandColorToken = keyof typeof BRAND.colors;

/*
 * Usage: Import for type-safe references in components or scripts.
 * Runtime values live in CSS custom properties for performance and theming flexibility.
 * This file serves as the documented strategy and type layer supporting the professional enterprise token management system.
 */