export const BRAND = {
  // Ametrine Precision Core Palette (single source of truth)
  primary: "#451EBB",
  primaryDeep: "#451EBB",
  primaryVariant: "#5D3FD3",
  primaryContainer: "#5D3FD3",
  onPrimary: "#FFFFFF",

  surface: "#F8F9FF",
  surfaceDim: "#CBDBF5",
  surfaceBright: "#F8F9FF",
  surfaceContainerLowest: "#FFFFFF",
  surfaceContainerLow: "#EFF4FF",
  surfaceContainer: "#E5EEFF",
  surfaceContainerHigh: "#DCE9FF",
  surfaceContainerHighest: "#D3E4FE",
  onSurface: "#0B1C30",
  onSurfaceVariant: "#484554",

  outline: "#797586",
  outlineVariant: "#C9C4D7",

  success: "#2E7D32",
  warning: "#ED6C02",
  error: "#BA1A1A",

  // Minimal supporting accents for Ametrine Precision coherence
  teal: "#4A635D",
  amber: "#B45309",
  rose: "#BA1A1A",
} as const;

export type BrandAccentPair = readonly [string, string];

export const ROUTE_ACCENT_DEFAULT: BrandAccentPair = [BRAND.primary, BRAND.primaryDeep];

export const ROUTE_ACCENT_VARIANTS = {
  primary: [BRAND.primary, BRAND.primaryDeep] as BrandAccentPair,
  soft: [BRAND.primaryVariant, BRAND.teal] as BrandAccentPair,
  warm: [BRAND.primaryDeep, BRAND.surfaceContainerLow] as BrandAccentPair,
  light: [BRAND.onSurface, BRAND.primary] as BrandAccentPair,
  cream: [BRAND.primary, BRAND.outlineVariant] as BrandAccentPair,
  critical: [BRAND.primary, BRAND.rose] as BrandAccentPair,
} as const;

export const NAV_GROUP_ACCENTS: Record<string, string> = {
  Command: BRAND.primary,
  Channels: BRAND.onSurface,
  Agents: BRAND.primaryDeep,
  Design: BRAND.primary,
  Admin: BRAND.teal,
};

export const ROUTE_ACCENTS: Record<string, BrandAccentPair> = {
  "/ops": ROUTE_ACCENT_VARIANTS.primary,
  "/triage": ROUTE_ACCENT_VARIANTS.warm,
  "/insights": ROUTE_ACCENT_VARIANTS.soft,
  "/logs": ROUTE_ACCENT_VARIANTS.primary,
  "/phone": ROUTE_ACCENT_VARIANTS.light,
  "/inbox": ROUTE_ACCENT_VARIANTS.light,
  "/email": ROUTE_ACCENT_VARIANTS.light,
  "/sms": ROUTE_ACCENT_VARIANTS.light,
  "/outbound": ROUTE_ACCENT_VARIANTS.cream,
  "/appointments": ROUTE_ACCENT_VARIANTS.warm,
  "/agents": ROUTE_ACCENT_VARIANTS.primary,
  "/chat": ROUTE_ACCENT_VARIANTS.soft,
  "/training": ROUTE_ACCENT_VARIANTS.warm,
  "/knowledge": ROUTE_ACCENT_VARIANTS.light,
  "/actions": ROUTE_ACCENT_VARIANTS.soft,
  "/admin": ROUTE_ACCENT_VARIANTS.primary,
  "/cockpit": ROUTE_ACCENT_VARIANTS.primary,
  "/dnc": ROUTE_ACCENT_VARIANTS.critical,
  "/audit": ROUTE_ACCENT_VARIANTS.cream,
  "/help": ROUTE_ACCENT_VARIANTS.soft,
  "/pipeline": ROUTE_ACCENT_VARIANTS.primary,
  "/founder": ROUTE_ACCENT_VARIANTS.cream,
  "/activity": ROUTE_ACCENT_VARIANTS.primary,
};

// All legacy 'signal*', 'Signal Blue', 'purple', and 'blue' aliases have been removed.
// This file is now the single source of truth for Ametrine Precision branding.
// Import BRAND.* directly in components and styles.