/**
 * Wireline brand palette — dark command-center preview.
 * Use for inline styles, route accents, and chrome that must not drift back
 * into the old Aurora Cream / purple bleed direction.
 */
export const BRAND = {
  /** Legacy key retained for compatibility; value is now electric cyan. */
  purple: "#33D1FF",
  /** Legacy key retained for compatibility; value is now command blue. */
  purpleDeep: "#425CFF",
  purpleMid: "#38BDF8",
  purpleRim: "#1D4ED8",
  purpleLight: "#7DDFFF",
  purpleMuted: "#8FB3D9",
  purpleInk: "#061121",
  cream: "#05070D",
  paper: "#070A13",
  creamWarm: "#0B1020",
  creamDeep: "#12182B",
  ink: "#F8FBFF",
  /** Dark elevated panel surface — composer, artifacts, live fades */
  velvet: "#070A13",
  /** Luminous brand on dark chrome (wordmarks, focus accents) */
  chromeGlow: "#33D1FF",
  /** Errors, overage, and critical compliance only — not decorative. */
  rose: "#FF575F",
  signal: "#40E691",
  warning: "#FFAD47",
} as const;

export type BrandAccentPair = readonly [string, string];

export const ROUTE_ACCENT_DEFAULT: BrandAccentPair = [BRAND.purple, BRAND.purpleDeep];

/** Subtle variation within the command-center palette — cyan/blue first, status colors only when meaningful. */
export const ROUTE_ACCENT_VARIANTS = {
  primary: [BRAND.purple, BRAND.purpleDeep] as BrandAccentPair,
  soft: [BRAND.purpleLight, BRAND.purpleMuted] as BrandAccentPair,
  warm: [BRAND.purple, BRAND.warning] as BrandAccentPair,
  light: [BRAND.purpleLight, BRAND.purple] as BrandAccentPair,
  cream: [BRAND.purpleDeep, BRAND.creamDeep] as BrandAccentPair,
  critical: [BRAND.rose, BRAND.warning] as BrandAccentPair,
  success: [BRAND.signal, BRAND.purple] as BrandAccentPair,
} as const;

export const NAV_GROUP_ACCENTS: Record<string, string> = {
  Studio: BRAND.purple,
  Command: BRAND.purpleDeep,
  Channels: BRAND.purpleLight,
  Agents: BRAND.purple,
  Design: BRAND.purpleMid,
  Admin: BRAND.purpleMuted,
};

/** Per-route accent pairs — command-center palette. */
export const ROUTE_ACCENTS: Record<string, BrandAccentPair> = {
  "/ops": ROUTE_ACCENT_VARIANTS.primary,
  "/triage": ROUTE_ACCENT_VARIANTS.warm,
  "/insights": ROUTE_ACCENT_VARIANTS.soft,
  "/logs": ROUTE_ACCENT_VARIANTS.primary,
  "/phone": ROUTE_ACCENT_VARIANTS.light,
  "/inbox": ROUTE_ACCENT_VARIANTS.light,
  "/email": ROUTE_ACCENT_VARIANTS.light,
  "/sms": ROUTE_ACCENT_VARIANTS.light,
  "/outbound": ROUTE_ACCENT_VARIANTS.success,
  "/appointments": ROUTE_ACCENT_VARIANTS.warm,
  "/agents": ROUTE_ACCENT_VARIANTS.primary,
  "/chat": ROUTE_ACCENT_VARIANTS.soft,
  "/training": ROUTE_ACCENT_VARIANTS.success,
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
