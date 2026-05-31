/**
 * Wireline brand palette — rich purple + warm cream only.
 * Use for inline styles, route accents, and chrome that must not drift
 * into off-brand blues, oranges, or teals.
 *
 * Each color in the palette is visually distinct:
 *   purple, purpleLight, purpleMuted, purpleDeep, purpleInk
 * represent a deliberate tonal gradient from brightest to darkest.
 */
export const BRAND = {
  /** Primary brand purple — vibrant, authoritative */
  purple: "#8B3FD6",
  /** Deepest purple — used for contrast and hover states */
  purpleDeep: "#3B154C",
  /** Lighter lavender tone — distinct from primary purple */
  purpleLight: "#A87BD4",
  /** Muted dusty purple — for secondary text and subtle accents */
  purpleMuted: "#8B6FA8",
  /** Near-black purple ink — maximum contrast for text on brand */
  purpleInk: "#2E0F4A",
  /** Warm cream surface — the paper background */
  cream: "#F5F0E6",
  /** The canonical paper/background color */
  paper: "#EFE9DC",
  /** Deeper warm cream for borders and secondary surfaces */
  creamWarm: "#D4C9B8",
  /** Deepest cream for hover states on cream surfaces */
  creamDeep: "#C4B5A0",
  /** Near-black ink for body text on cream */
  ink: "#1A1614",
  /** Errors, overage, and critical compliance only — not decorative */
  rose: "#E8466A",
} as const;

export type BrandAccentPair = readonly [string, string];

export const ROUTE_ACCENT_DEFAULT: BrandAccentPair = [BRAND.purple, BRAND.purpleDeep];

/** Subtle variation within purple/cream — each pair uses two distinct colors. */
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