/**
 * DEPRECATED — Legacy Signal branding layer.
 * All decorative classes and Ametrine Precision visual language now live in:
 * - src/styles/design-system.css
 * - src/constants/brand-colors.ts (Ametrine Precision tokens)
 * - Custom UI components in src/components/ui/ (NebulaPulse, PrismBadge, etc.)
 *
 * This file is retained only for backward compatibility during transition.
 * New code should not import from here.
 * 
 * Ametrine Precision is the authoritative design system.
 */

export const WL_SIGNAL_CLASSES = {
  // Deprecated — use Ametrine Precision equivalents from design-system.css
  fleetConstellation: "wl-Assistants-constellation",
  fleetConstellationRefined: "wl-Assistants-constellation--refined",
  signalOrbFrame: "wl-signal-orb-frame", // consider renaming to wl-ametrine-orb-frame in future
  signalOrbRefined: "wl-signal-orb-frame--refined",
  canvasConstellation: "wl-canvas-constellation",
  emptyStateSignal: "wl-empty-state--signal",
} as const;

// TODO: Full migration to pure Ametrine Precision class names across UI components.
