import {
  wirelineToken,
  wirelineTokenValues,
  type WirelineTokenPath,
} from "./generated-design-tokens";

/**
 * Design-token runtime manifest.
 *
 * Source of truth: design-tokens/wireline.tokens.json
 * Generated artifacts: CSS custom properties and this typed TypeScript map.
 *
 * The JSON format intentionally follows DTCG-style `$type` / `$value` leaves,
 * so Tokens Studio, Style Dictionary, and native platform adapters can be
 * introduced without changing application-facing semantic paths.
 */
export const DESIGN_TOKENS = {
  source: "design-tokens/wireline.tokens.json",
  format: "dtcg-json -> css-custom-properties + typed-typescript",
  values: wirelineTokenValues,
  get: wirelineToken,
  toJSON: () => ({ ...wirelineTokenValues }),
} as const;

export { wirelineToken, wirelineTokenValues };
export type { WirelineTokenPath };
