/**
 * Wireline "Signal" brand palette — electric Signal Blue + Live Teal on
 * porcelain. Use for inline styles, route accents, and chrome. The historical
 * `purple*` keys are retained as stable aliases (every consumer keeps working);
 * their values now resolve to the Signal Blue family. Prefer `signal`/`teal`
 * for new code.
 */
export const BRAND = {
  /* Canonical Signal tokens (preferred for new code). */
  signal: "#2B5BF0",
  signalBright: "#5B82FF",
  signalDeep: "#1E3FB0",
  teal: "#0FB5BA",
  tealBright: "#2FD4D9",
  amber: "#F5A623",

  /* Legacy aliases — remapped to the Signal Blue family. */
  purple: "#2B5BF0",
  purpleDeep: "#1E3FB0",
  purpleMid: "#3A5FE0",
  purpleRim: "#14307E",
  purpleLight: "#5B82FF",
  purpleMuted: "#6B7BA8",
  purpleInk: "#0B1A44",
  cream: "#F8F9FB",
  paper: "#F8F9FB",
  creamWarm: "#EEF0F4",
  creamDeep: "#DDE2EC",
  ink: "#0B0D12",
  /** Dark elevated panel surface — composer, artifacts, live fades */
  velvet: "#13151C",
  /** Luminous brand on dark chrome (wordmarks, focus accents) */
  chromeGlow: "#5B82FF",
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
