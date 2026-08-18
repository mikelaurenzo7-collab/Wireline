/**
 * Stable, role-agnostic bot identity marks.
 *
 * A Bot Mark identifies one configured bot in dense product surfaces without
 * asking customers to choose an avatar, persona, or visual theme. The bot's
 * role never affects the mark: identity and capability stay separate.
 */

export type BotMarkPaletteEntry = {
  background: string;
  foreground: string;
};

/**
 * Deliberately stays inside Wireline's violet / indigo / graphite family.
 * Status colors are excluded so an identity mark can never be mistaken for
 * success, warning, or error state.
 */
export const BOT_MARK_PALETTE: readonly BotMarkPaletteEntry[] = [
  { background: "#7C3AED", foreground: "#FFFFFF" },
  { background: "#8B5CF6", foreground: "#FFFFFF" },
  { background: "#A78BFA", foreground: "#0E0B16" },
  { background: "#6D5DFB", foreground: "#FFFFFF" },
  { background: "#4F46E5", foreground: "#FFFFFF" },
  { background: "#7667A8", foreground: "#FFFFFF" },
  { background: "#5B5868", foreground: "#FFFFFF" },
  { background: "#C7CCD6", foreground: "#0E0B16" },
] as const;

/** Stable FNV-1a hash so the same bot keeps the same mark across sessions. */
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

export function botMarkFor(input: {
  id?: string | null;
  name?: string | null;
  seed?: string | null;
}) {
  const seed = normalizeBotMarkSeed(input.seed || input.id || input.name || "bot");
  const hash = stableBotMarkHash(seed);
  return {
    seed,
    initial: botMarkInitial(input.name || input.seed || input.id || "Bot"),
    palette: BOT_MARK_PALETTE[hash % BOT_MARK_PALETTE.length],
  };
}
