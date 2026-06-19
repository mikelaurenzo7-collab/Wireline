/**
 * Wireline "Signal" brand palette — vivid Emerald + electric Cyan on
 * porcelain, with warm Amber energy. Use for inline styles, route accents, and
 * chrome. The historical `purple*` keys are retained as stable aliases (every
 * consumer keeps working); their values now resolve to the Emerald family.
 * Prefer `signal`/`teal`/`amber` for new code.
 */
export const BRAND = {
  /* Canonical Signal tokens (preferred for new code). */
  signal: "#0D9F6E",
  signalBright: "#10B981",
  signalDeep: "#047857",
  teal: "#0891B2",
  tealBright: "#22D3EE",
  amber: "#F5A623",

  /* Legacy aliases — remapped to the Emerald family. */
  purple: "#0D9F6E",
  purpleDeep: "#047857",
  purpleMid: "#0FA873",
  purpleRim: "#03543F",
  purpleLight: "#10B981",
  purpleMuted: "#6B8F82",
  purpleInk: "#04231A",
  cream: "#F7F9F8",
  paper: "#F7F9F8",
  creamWarm: "#EEF2F0",
  creamDeep: "#DCE6E1",
  ink: "#0A0F0D",
  /** Dark elevated panel surface — composer, artifacts, live fades */
  velvet: "#101513",
  /** Luminous brand on dark chrome (wordmarks, focus accents) */
  chromeGlow: "#34D399",
  /** Errors, overage, and critical compliance only — not decorative. */
  rose: "#E5484D",
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
