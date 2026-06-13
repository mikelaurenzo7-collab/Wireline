/**
 * Wireline brand palette — Rich Cream + Controlled Purple.
 *
 * This replaces the old "aurora" rule language. The brand should feel rich,
 * warm, editorial, and premium — not multicolor, not smeared, and not a purple
 * haze bleeding across cream surfaces.
 */
export const BRAND = {
  /** Primary brand purple — intentionally lighter/cleaner than the previous violet. */
  purple: "#9B5CE0",
  /** Deep purple reserved for text, chrome, and intentional contrast only. */
  purpleDeep: "#4C1D75",
  purpleMid: "#7C3FC6",
  purpleRim: "#6B2BA8",
  purpleLight: "#B982FF",
  purpleMuted: "#A88BC7",
  purpleInk: "#2E123F",
  cream: "#F5F0E6",
  paper: "#EFE9DC",
  creamWarm: "#E8DCC8",
  creamDeep: "#D4C9B8",
  ink: "#1A1614",
  /** Dark elevated panel surface — composer, artifacts, live fades */
  velvet: "#1A1225",
  /** Luminous brand on dark chrome. Keep controlled; do not use as page bleed. */
  chromeGlow: "#B982FF",
  /** Errors, overage, and critical compliance only — not decorative. */
  rose: "#E8466A",
  signal: "#10B981",
  warning: "#B7791F",
} as const;

export type BrandAccentPair = readonly [string, string];

export const ROUTE_ACCENT_DEFAULT: BrandAccentPair = [BRAND.purple, BRAND.purpleDeep];

/**
 * Controlled purple/cream route accents.
 * Avoid multicolor "aurora" pairing. Accent pairs should stay in the brand
 * family, with status colors used only when the route semantics require them.
 */
export const ROUTE_ACCENT_VARIANTS = {
  primary: [BRAND.purple, BRAND.purpleDeep] as BrandAccentPair,
  soft: [BRAND.purpleLight, BRAND.purpleMuted] as BrandAccentPair,
  warm: [BRAND.purple, BRAND.creamDeep] as BrandAccentPair,
  light: [BRAND.purpleLight, BRAND.purple] as BrandAccentPair,
  cream: [BRAND.purple, BRAND.creamDeep] as BrandAccentPair,
  critical: [BRAND.purple, BRAND.rose] as BrandAccentPair,
  success: [BRAND.purple, BRAND.signal] as BrandAccentPair,
} as const;

export const NAV_GROUP_ACCENTS: Record<string, string> = {
  Studio: BRAND.purple,
  Command: BRAND.purpleDeep,
  Channels: BRAND.purpleLight,
  Agents: BRAND.purpleMid,
  Design: BRAND.purpleMuted,
  Admin: BRAND.purpleDeep,
};

/** Per-route accent pairs — Rich Cream + Controlled Purple. */
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
  "/integrations": ROUTE_ACCENT_VARIANTS.soft,
  "/admin": ROUTE_ACCENT_VARIANTS.primary,
  "/cockpit": ROUTE_ACCENT_VARIANTS.primary,
  "/dnc": ROUTE_ACCENT_VARIANTS.critical,
  "/audit": ROUTE_ACCENT_VARIANTS.cream,
  "/help": ROUTE_ACCENT_VARIANTS.soft,
  "/pipeline": ROUTE_ACCENT_VARIANTS.primary,
  "/founder": ROUTE_ACCENT_VARIANTS.cream,
  "/activity": ROUTE_ACCENT_VARIANTS.primary,
};
