/**
 * Curated Bot pictures.
 *
 * BotBound's robot is the company mark. These marks identify individual Bots
 * in the product. Fifteen symbols and eight colors make 120 pictures. A
 * workspace prefers an unused picture, then reuses one. A picture is not a
 * Bot slot, and two Bots may share one.
 * Role and runtime status never choose or recolor the identity.
 */

export type BotMarkPaletteEntry = {
  surfaceFrom: string;
  surfaceTo: string;
  wire: string;
  accent: string;
  ink: string;
  halo: string;
};

export const BOT_MARK_MOTIFS = [
  { key: "orbit", label: "Orbit" },
  { key: "beacon", label: "Beacon" },
  { key: "spark", label: "Spark" },
  { key: "prism", label: "Prism" },
  { key: "flow", label: "Flow" },
  { key: "pulse", label: "Pulse" },
  { key: "compass", label: "Compass" },
  { key: "focus", label: "Focus" },
  { key: "aperture", label: "Aperture" },
  { key: "wave", label: "Wave" },
  { key: "helix", label: "Helix" },
  { key: "loop", label: "Loop" },
  { key: "nova", label: "Nova" },
  { key: "route", label: "Route" },
  { key: "vertex", label: "Vertex" },
] as const;

export type BotMarkMotif = (typeof BOT_MARK_MOTIFS)[number]["key"];

export const BOT_MARK_PALETTES = [
  {
    key: "violet",
    label: "Violet",
    colors: {
      surfaceFrom: "#7257E8",
      surfaceTo: "#4226A5",
      wire: "#FBFAFF",
      accent: "#DCD3FF",
      ink: "#17111F",
      halo: "rgba(114, 87, 232, 0.34)",
    },
  },
  {
    key: "blue",
    label: "Blue",
    colors: {
      surfaceFrom: "#1689E8",
      surfaceTo: "#0A57AC",
      wire: "#F7FCFF",
      accent: "#9BD9FF",
      ink: "#071522",
      halo: "rgba(22, 137, 232, 0.32)",
    },
  },
  {
    key: "rose",
    label: "Rose",
    colors: {
      surfaceFrom: "#D95383",
      surfaceTo: "#8F2D57",
      wire: "#FFF9FC",
      accent: "#FFC0D6",
      ink: "#241018",
      halo: "rgba(217, 83, 131, 0.30)",
    },
  },
  {
    key: "amber",
    label: "Amber",
    colors: {
      surfaceFrom: "#D47B22",
      surfaceTo: "#8A4209",
      wire: "#FFFDF8",
      accent: "#FFD39B",
      ink: "#201205",
      halo: "rgba(212, 123, 34, 0.30)",
    },
  },
  {
    key: "teal",
    label: "Teal",
    colors: {
      surfaceFrom: "#159B8D",
      surfaceTo: "#07665E",
      wire: "#F6FFFD",
      accent: "#9DE8DE",
      ink: "#061A18",
      halo: "rgba(21, 155, 141, 0.30)",
    },
  },
  {
    key: "magenta",
    label: "Magenta",
    colors: {
      surfaceFrom: "#A84BD2",
      surfaceTo: "#6C258F",
      wire: "#FEFAFF",
      accent: "#E6B7FA",
      ink: "#1B0B22",
      halo: "rgba(168, 75, 210, 0.31)",
    },
  },
  {
    key: "indigo",
    label: "Indigo",
    colors: {
      surfaceFrom: "#526DE1",
      surfaceTo: "#2C3D9B",
      wire: "#FAFBFF",
      accent: "#B8C5FF",
      ink: "#0D1227",
      halo: "rgba(82, 109, 225, 0.31)",
    },
  },
  {
    key: "slate",
    label: "Slate",
    colors: {
      surfaceFrom: "#607C91",
      surfaceTo: "#334B60",
      wire: "#FAFDFF",
      accent: "#BDD4E4",
      ink: "#0B151D",
      halo: "rgba(96, 124, 145, 0.29)",
    },
  },
] as const satisfies ReadonlyArray<{
  key: string;
  label: string;
  colors: BotMarkPaletteEntry;
}>;

export type BotMarkPaletteKey = (typeof BOT_MARK_PALETTES)[number]["key"];
export type BotMarkKey = `${BotMarkMotif}-${BotMarkPaletteKey}`;

export const BOT_MARK_CHOICES: ReadonlyArray<{
  key: BotMarkKey;
  label: string;
  motif: BotMarkMotif;
  motifLabel: string;
  paletteKey: BotMarkPaletteKey;
  paletteLabel: string;
  palette: BotMarkPaletteEntry;
}> = BOT_MARK_PALETTES.flatMap((palette) =>
  BOT_MARK_MOTIFS.map((motif) => ({
    key: `${motif.key}-${palette.key}` as BotMarkKey,
    label: `${motif.label} · ${palette.label}`,
    motif: motif.key,
    motifLabel: motif.label,
    paletteKey: palette.key,
    paletteLabel: palette.label,
    palette: palette.colors,
  })),
);

/** Compatibility export for policy and downstream visual-contract checks. */
export const BOT_MARK_PALETTE = BOT_MARK_PALETTES.map((palette) => palette.colors);
/** The number of curated pictures. Workspaces may reuse one after these are all in use. */
export const BOT_MARK_IDENTITY_CAPACITY = BOT_MARK_CHOICES.length;
/** Stable animation-signature space retained for existing persisted Bot ids. */
export const BOT_MARK_SIGNATURE_CAPACITY = 1_048_576;
/** @deprecated Use BOT_MARK_SIGNATURE_CAPACITY. */
export const BOT_MARK_GRADIENT_CAPACITY = BOT_MARK_SIGNATURE_CAPACITY;
const BOT_MARK_SIGNATURE_MASK = BOT_MARK_SIGNATURE_CAPACITY - 1;
const BOT_MARK_KEY_SET = new Set<string>(BOT_MARK_CHOICES.map((choice) => choice.key));

/** Stable FNV-1a hash so an unconfigured Bot keeps the same fallback mark. */
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

export function isBotMarkKey(value: unknown): value is BotMarkKey {
  return typeof value === "string" && BOT_MARK_KEY_SET.has(value);
}

export function parseBotMarkKey(key: BotMarkKey) {
  const choice = BOT_MARK_CHOICES.find((candidate) => candidate.key === key)!;
  return { motif: choice.motif, paletteKey: choice.paletteKey } as const;
}

export function defaultBotMarkKey(seed: string | null | undefined): BotMarkKey {
  const normalized = normalizeBotMarkSeed(seed);
  return BOT_MARK_CHOICES[stableBotMarkHash(normalized) % BOT_MARK_CHOICES.length].key;
}

/** Prefers an unused picture, then reuses one so another Bot can still be created. */
export function firstAvailableBotMarkKey(
  seed: string | null | undefined,
  unavailableKeys: Iterable<string>,
): BotMarkKey {
  const unavailable = new Set(
    Array.from(unavailableKeys).filter((candidate): candidate is BotMarkKey =>
      isBotMarkKey(candidate),
    ),
  );
  const usedMotifs = new Set<BotMarkMotif>();
  for (const key of unavailable) usedMotifs.add(parseBotMarkKey(key).motif);
  const unusedMotifChoices = BOT_MARK_CHOICES.filter((choice) => !usedMotifs.has(choice.motif));
  const candidatePool = unusedMotifChoices.length > 0 ? unusedMotifChoices : BOT_MARK_CHOICES;
  const start = stableBotMarkHash(normalizeBotMarkSeed(seed)) % candidatePool.length;
  for (let offset = 0; offset < candidatePool.length; offset += 1) {
    const candidate = candidatePool[(start + offset) % candidatePool.length].key;
    if (!unavailable.has(candidate)) return candidate;
  }
  return defaultBotMarkKey(seed);
}

export function botMarkFor(input: {
  id?: string | null;
  name?: string | null;
  seed?: string | null;
  markKey?: string | null;
}) {
  const seed = normalizeBotMarkSeed(input.seed || input.id || input.name || "bot");
  const key = isBotMarkKey(input.markKey) ? input.markKey : defaultBotMarkKey(seed);
  const choice = BOT_MARK_CHOICES.find((candidate) => candidate.key === key)!;
  const hash = stableBotMarkHash(seed);

  return {
    seed,
    key,
    label: choice.label,
    motif: choice.motif,
    motifLabel: choice.motifLabel,
    paletteKey: choice.paletteKey,
    paletteLabel: choice.paletteLabel,
    palette: choice.palette,
    gradientSignature: hash & BOT_MARK_SIGNATURE_MASK,
    phaseMs: -(hash % 900),
  } as const;
}
