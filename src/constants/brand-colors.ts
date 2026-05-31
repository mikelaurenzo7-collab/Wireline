export const BRAND = {
  purple: "#7C3AED",
  purpleDeep: "#581C87",
  purpleLight: "#A78BFA",
  purpleMuted: "#8B7FCD",
  purpleInk: "#1E0A3D",
  cream: "#F4F1EA",
  paper: "#F4F1EA",
  creamWarm: "#E8E2D8",
  creamDeep: "#D6CEC2",
  ink: "#1C1917",
  rose: "#E8466A",
} as const;

export type BrandAccentPair = readonly [string, string];

export const ROUTE_ACCENT_DEFAULT: BrandAccentPair = [BRAND.purple, BRAND.purpleDeep];

export const ROUTE_ACCENT_VARIANTS = {
  primary: [BRAND.purple, BRAND.purpleDeep] as BrandAccentPair,
  soft: [BRAND.purple, BRAND.purpleMuted] as BrandAccentPair,
  warm: [BRAND.purpleDeep, BRAND.creamWarm] as BrandAccentPair,
  light: [BRAND.purpleLight, BRAND.purpleDeep] as BrandAccentPair,
  cream: [BRAND.purple, BRAND.creamDeep] as BrandAccentPair,
  critical: [BRAND.purple, BRAND.rose] as BrandAccentPair,
} as const;

export const NAV_GROUP_ACCENTS: Record<string, string> = {
  Workspace: BRAND.purple,
  Channels: BRAND.purpleLight,
  Sales: BRAND.purpleDeep,
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
