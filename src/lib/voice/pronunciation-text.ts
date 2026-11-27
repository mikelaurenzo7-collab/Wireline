import type { Pronunciation } from "../phone-voices";

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * For speech engines that take no pronunciation list of their own: returns a
 * function that swaps each listed word for how it should be said. It follows
 * the phone engine's rules, so a Bot sounds the same whichever voice answers:
 * whole words only, any capitals, and the longest entry first.
 *
 * Server-side only. The pattern uses lookbehind, which older phone browsers
 * cannot parse, so this stays out of the module the picker shares.
 */
export function pronunciationRewriter(
  pronunciations: readonly Pronunciation[],
): (text: string) => string {
  const byWord = new Map(pronunciations.map(({ word, say }) => [word.toLowerCase(), say]));
  if (!byWord.size) return (text) => text;
  const alternatives = [...byWord.keys()]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives})(?![\\p{L}\\p{N}])`, "giu");
  return (text) => text.replace(pattern, (match) => byWord.get(match.toLowerCase()) ?? match);
}
