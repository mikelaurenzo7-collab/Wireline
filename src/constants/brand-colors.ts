/**
 * Wireline brand palette — rich purple + warm cream only.
 * Use for inline styles, route accents, and chrome that must not drift
 * into off-brand blues, oranges, or teals.
 */
export const BRAND = {
  purple: "#8B3FD6",
  purpleDeep: "#3B154C",
  purpleMid: "#6B2B99",
  purpleRim: "#5A1F7A",
  purpleLight: "#8B3FD6",
  purpleMuted: "#8B6FA8",
  purpleInk: "#2E0F4A",
  cream: "#F5F0E6",
  paper: "#EFE9DC",
  creamWarm: "#D4C9B8",
  creamDeep: "#C4B5A0",
  ink: "#1A1614",
  /** Dark elevated panel surface — composer, artifacts, live fades */
  velvet: "#1A1225",
  /** Luminous brand on dark chrome (wordmarks, focus accents) */
  chromeGlow: "#C77DFF",
  /** Errors, overage, and critical compliance only — not decorative. */
  rose: "#E8466A",
} as const;

export type BrandAccentPair = readonly [string, string];

export const ROUTE_ACCENT_DEFAULT: BrandAccentPair = [BRAND.purple, BRAND.purpleDeep];

/** Subtle variation within purple/cream — never cross-hue. */
export const ROUTE_ACCENT_VARIANTS = {
  primary: [BRAND.purple, BRAND.purpleDeep] as BrandAccentPair,
  soft: [BRAND.purple, BRAND.purpleMuted] as BrandAccentPair,
  warm: [BRAND.purpleDeep, BRAND.creamWarm] as BrandAccentPair,
  light: [BRAND.purpleLight, BRAND.purple] as BrandAccentPair,
  cream: [BRAND.purple, BRAND.creamDeep] as BrandAccentPair,
  critical: [BRAND.purple, BRAND.rose] as BrandAccentPair,
} as const;

export const NAV_GROUP_ACCENTS: Record<string, string> = {
  Command: BRAND.purple,
  Channels: BRAND.purpleLight,
  Agents: BRAND.purpleDeep,
  Design: BRAND.purpleMid,
  Admin: BRAND.purpleMuted,
};

/** Per-route accent pairs — all purple/cream family. */
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
  "/design": ROUTE_ACCENT_VARIANTS.warm,
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
