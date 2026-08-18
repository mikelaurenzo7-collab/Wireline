/**
 * Stable, role-agnostic Bot Marks.
 *
 * A Bot Mark identifies one configured Bot in dense product surfaces without
 * asking customers to choose an avatar, persona, or visual theme. The Bot's
 * role never affects the mark: identity and capability stay separate.
 *
 * The mark is intentionally a tiny Wireline signal system rather than a colored
 * initial. A stable seed selects a restrained obsidian/violet/platinum gradient,
 * one of several wire geometries, an orientation, and an anchor point. This
 * gives customers fast recognition without creating another configuration
 * product or confusing identity color with operational status.
 */

export type BotMarkPaletteEntry = {
  surfaceFrom: string;
  surfaceTo: string;
  wire: string;
  accent: string;
  ink: string;
  halo: string;
};

export type BotMarkMotif = "orbit" | "relay" | "split" | "loop" | "pulse" | "weave";

type BotMarkGradientFamily = {
  hue: number;
  hueSpan: number;
  saturation: number;
  saturationSpan: number;
  surfaceLight: number;
  surfaceLightSpan: number;
};

/**
 * Twenty deterministic gradient bits yield 1,048,576 brand-safe gradient
 * signatures before motif, rotation, mirror, anchor, glow position, or
 * monogram are considered. This deliberately dwarfs the commercial Bot-count
 * ceiling so a large workspace does not exhaust the visual identity system.
 */
export const BOT_MARK_GRADIENT_CAPACITY = 1_048_576;
const BOT_MARK_GRADIENT_MASK = BOT_MARK_GRADIENT_CAPACITY - 1;

/**
 * Sixteen narrow families define the only hue territory the generator may use:
 * deep indigo through electric violet, plus cool graphite/platinum lanes. No
 * red, green, amber, cyan, or other status-like hue is available here.
 */
const BOT_MARK_GRADIENT_FAMILIES: readonly BotMarkGradientFamily[] = [
  { hue: 258, hueSpan: 10, saturation: 42, saturationSpan: 12, surfaceLight: 20, surfaceLightSpan: 7 },
  { hue: 266, hueSpan: 12, saturation: 46, saturationSpan: 12, surfaceLight: 19, surfaceLightSpan: 8 },
  { hue: 246, hueSpan: 11, saturation: 40, saturationSpan: 12, surfaceLight: 18, surfaceLightSpan: 8 },
  { hue: 274, hueSpan: 11, saturation: 38, saturationSpan: 13, surfaceLight: 20, surfaceLightSpan: 7 },
  { hue: 252, hueSpan: 13, saturation: 34, saturationSpan: 14, surfaceLight: 19, surfaceLightSpan: 8 },
  { hue: 263, hueSpan: 13, saturation: 25, saturationSpan: 12, surfaceLight: 18, surfaceLightSpan: 7 },
  { hue: 246, hueSpan: 12, saturation: 14, saturationSpan: 10, surfaceLight: 17, surfaceLightSpan: 7 },
  { hue: 271, hueSpan: 12, saturation: 18, saturationSpan: 11, surfaceLight: 18, surfaceLightSpan: 8 },
  { hue: 279, hueSpan: 9, saturation: 38, saturationSpan: 12, surfaceLight: 19, surfaceLightSpan: 8 },
  { hue: 240, hueSpan: 10, saturation: 34, saturationSpan: 12, surfaceLight: 17, surfaceLightSpan: 8 },
  { hue: 266, hueSpan: 12, saturation: 12, saturationSpan: 10, surfaceLight: 20, surfaceLightSpan: 7 },
  { hue: 255, hueSpan: 12, saturation: 30, saturationSpan: 13, surfaceLight: 17, surfaceLightSpan: 8 },
  { hue: 272, hueSpan: 12, saturation: 31, saturationSpan: 13, surfaceLight: 20, surfaceLightSpan: 7 },
  { hue: 238, hueSpan: 10, saturation: 22, saturationSpan: 11, surfaceLight: 18, surfaceLightSpan: 7 },
  { hue: 252, hueSpan: 14, saturation: 8, saturationSpan: 9, surfaceLight: 19, surfaceLightSpan: 7 },
  { hue: 276, hueSpan: 11, saturation: 42, saturationSpan: 11, surfaceLight: 18, surfaceLightSpan: 8 },
] as const;

/**
 * Curated anchor gradients kept as a readable design reference and compatibility
 * export. Runtime marks are generated continuously around these same families
 * instead of being limited to these ten swatches.
 */
export const BOT_MARK_PALETTE: readonly BotMarkPaletteEntry[] = [
  {
    surfaceFrom: "#35245F",
    surfaceTo: "#0E0B16",
    wire: "#E6DEFF",
    accent: "#A78BFA",
    ink: "#F5F4F8",
    halo: "rgba(167, 139, 250, 0.34)",
  },
  {
    surfaceFrom: "#25215B",
    surfaceTo: "#090A17",
    wire: "#D8DEFF",
    accent: "#8F9CFF",
    ink: "#F5F4F8",
    halo: "rgba(143, 156, 255, 0.30)",
  },
  {
    surfaceFrom: "#40305D",
    surfaceTo: "#100C18",
    wire: "#F0E8FF",
    accent: "#C4B5FD",
    ink: "#F5F4F8",
    halo: "rgba(196, 181, 253, 0.30)",
  },
  {
    surfaceFrom: "#292635",
    surfaceTo: "#0B0A10",
    wire: "#EEF1F7",
    accent: "#C7CCD6",
    ink: "#F5F4F8",
    halo: "rgba(199, 204, 214, 0.26)",
  },
  {
    surfaceFrom: "#272D49",
    surfaceTo: "#090C15",
    wire: "#D7E0FF",
    accent: "#AEBBEE",
    ink: "#F5F4F8",
    halo: "rgba(174, 187, 238, 0.28)",
  },
  {
    surfaceFrom: "#39264A",
    surfaceTo: "#0F0A14",
    wire: "#ECDDF7",
    accent: "#BDA5DD",
    ink: "#F5F4F8",
    halo: "rgba(189, 165, 221, 0.28)",
  },
  {
    surfaceFrom: "#332B49",
    surfaceTo: "#0D0B14",
    wire: "#E4DDF1",
    accent: "#B6A9CF",
    ink: "#F5F4F8",
    halo: "rgba(182, 169, 207, 0.28)",
  },
  {
    surfaceFrom: "#20293A",
    surfaceTo: "#080B11",
    wire: "#DDE5F1",
    accent: "#A9B7CE",
    ink: "#F5F4F8",
    halo: "rgba(169, 183, 206, 0.26)",
  },
  {
    surfaceFrom: "#312347",
    surfaceTo: "#0D0913",
    wire: "#E9DDF8",
    accent: "#A78BFA",
    ink: "#F5F4F8",
    halo: "rgba(167, 139, 250, 0.30)",
  },
  {
    surfaceFrom: "#262233",
    surfaceTo: "#0A0910",
    wire: "#E3E4EA",
    accent: "#B7BBC6",
    ink: "#F5F4F8",
    halo: "rgba(183, 187, 198, 0.24)",
  },
] as const;

export const BOT_MARK_MOTIFS: readonly BotMarkMotif[] = [
  "orbit",
  "relay",
  "split",
  "loop",
  "pulse",
  "weave",
] as const;

const BOT_MARK_ANCHORS = [
  { x: 8.25, y: 19.75 },
  { x: 11.25, y: 8.5 },
  { x: 22.75, y: 10.25 },
  { x: 23.5, y: 20.5 },
  { x: 16, y: 23.25 },
  { x: 16, y: 8.5 },
] as const;

/** Stable FNV-1a hash so the same Bot keeps the same mark across sessions. */
export function stableBotMarkHash(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function normalizeBotMarkSeed(seed: string | null | undefined): string {
  return (seed || "bot").trim().replace(/\s+/g, " ") || "bot";
}

export function botMarkInitial(label: string | null | undefined): string {
  const normalized = normalizeBotMarkSeed(label);
  const firstLetter = Array.from(normalized).find((character) => /[\p{L}\p{N}]/u.test(character));
  return (firstLetter || "B").toLocaleUpperCase();
}

function mixedHash(seed: string, salt: string): number {
  return stableBotMarkHash(`${salt}:${seed}`);
}

function unit(value: number, maximum: number): number {
  return maximum <= 0 ? 0 : value / maximum;
}

function hsl(hue: number, saturation: number, lightness: number): string {
  return `hsl(${hue.toFixed(1)}, ${saturation.toFixed(1)}%, ${lightness.toFixed(1)}%)`;
}

function hsla(hue: number, saturation: number, lightness: number, alpha: number): string {
  return `hsla(${hue.toFixed(1)}, ${saturation.toFixed(1)}%, ${lightness.toFixed(1)}%, ${alpha.toFixed(2)})`;
}

function generatedGradient(hash: number): BotMarkPaletteEntry {
  const signature = hash & BOT_MARK_GRADIENT_MASK;
  const hueStep = signature & 0x3f;
  const saturationStep = (signature >>> 6) & 0x1f;
  const lightStep = (signature >>> 11) & 0x1f;
  const family = BOT_MARK_GRADIENT_FAMILIES[(signature >>> 16) & 0x0f];

  const hue = family.hue + unit(hueStep, 0x3f) * family.hueSpan;
  const saturation =
    family.saturation + unit(saturationStep, 0x1f) * family.saturationSpan;
  const surfaceLight =
    family.surfaceLight + unit(lightStep, 0x1f) * family.surfaceLightSpan;
  const depthLight = 5.2 + unit((signature >>> 3) & 0x1f, 0x1f) * 4.2;
  const accentSaturation = Math.min(78, saturation + 24);
  const accentLight = 67 + unit((signature >>> 8) & 0x0f, 0x0f) * 9;
  const wireSaturation = Math.max(10, Math.min(38, saturation - 4));
  const wireLight = 87 + unit((signature >>> 13) & 0x07, 0x07) * 7;
  const haloAlpha = 0.23 + unit((signature >>> 5) & 0x07, 0x07) * 0.11;

  return {
    surfaceFrom: hsl(hue, saturation, surfaceLight),
    surfaceTo: hsl(hue + 2.5, Math.max(8, saturation - 8), depthLight),
    wire: hsl(hue - 2, wireSaturation, wireLight),
    accent: hsl(hue, accentSaturation, accentLight),
    ink: "#F5F4F8",
    halo: hsla(hue, accentSaturation, accentLight, haloAlpha),
  };
}

export function botMarkFor(input: {
  id?: string | null;
  name?: string | null;
  seed?: string | null;
}) {
  const seed = normalizeBotMarkSeed(input.seed || input.id || input.name || "bot");
  const hash = stableBotMarkHash(seed);
  const geometryHash = mixedHash(seed, "wire");
  const lightHash = mixedHash(seed, "light");
  const palette = generatedGradient(hash);
  const motif = BOT_MARK_MOTIFS[geometryHash % BOT_MARK_MOTIFS.length];
  const anchor = BOT_MARK_ANCHORS[(geometryHash >>> 5) % BOT_MARK_ANCHORS.length];

  return {
    seed,
    gradientSignature: hash & BOT_MARK_GRADIENT_MASK,
    initial: botMarkInitial(input.name || input.seed || input.id || "Bot"),
    palette,
    motif,
    anchor,
    rotation: ((geometryHash >>> 9) % 8) * 45,
    mirror: ((geometryHash >>> 13) & 1) === 1,
    glowX: 24 + (lightHash % 53),
    glowY: 18 + ((lightHash >>> 7) % 49),
    phaseMs: -((geometryHash >>> 15) % 1200),
  } as const;
}
