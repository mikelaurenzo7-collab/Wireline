/**
 * Wireline "Lavender Noir" brand palette — three colors: soft lavender,
 * vivid violet, charcoal. Every historical key name is preserved so
 * consumers keep working; values now resolve to the Lavender Noir family.
 */
export const BRAND = {
  signal: "#7C3AED",
  signalBright: "#A78BFA",
  signalDeep: "#5B21B6",
  teal: "#A78BFA",
  tealBright: "#7C3AED",
  amber: "#7C3AED",

  purple: "#7C3AED",
  purpleDeep: "#5B21B6",
  purpleMid: "#6D28D9",
  purpleRim: "#4C1D95",
  purpleLight: "#A78BFA",
  purpleMuted: "#6E6584",
  purpleInk: "#1E1B2E",
  cream: "#F3EFFA",
  paper: "#FAF8FF",
  creamWarm: "#EDE7F6",
  creamDeep: "#E8E0F5",
  ink: "#1E1B2E",
  velvet: "#1E1B2E",
  chromeGlow: "#A78BFA",
  rose: "#DC2626",
} as const;

export type BrandAccentPair = readonly [string, string];

export const ROUTE_ACCENT_DEFAULT: BrandAccentPair = [BRAND.purple, BRAND.purpleDeep];

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
