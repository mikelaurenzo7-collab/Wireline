/**
 * Provider-neutral AI runtime entrypoint.
 *
 * Managed work is OpenAI-first with automatic Gemini fallback. This module is
 * the stable import surface while historical Claude-named files are removed.
 */
export * from "./claude-models";
export * from "./claude-audit";
export * from "./claude-client";
export * from "./claude-structured";
export * from "./claude-tools";
export * from "./claude-recipes";
