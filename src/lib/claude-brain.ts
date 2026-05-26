/**
 * Wireline Claude Brain — barrel re-export.
 * ---------------------------------------------------------------------------
 * The implementation has been decomposed into focused modules for
 * maintainability. This file preserves backward compatibility so
 * existing `import * as claudeBrain from "./claude-brain"` and
 * named imports continue to work without changes.
 *
 * Module map:
 *   claude-models.ts     — Model constants, pricing, tiering, Vapi selection
 *   claude-audit.ts      — AsyncLocalStorage audit capture, cost estimation
 *   claude-client.ts     — Anthropic client singleton, availability check
 *   claude-structured.ts — runStructured, runCompletion, runCompletionResilient
 *   claude-tools.ts      — All TOOLS schemas (25+ tool definitions)
 *   claude-recipes.ts    — Convenience wrappers (brief, qualify, coach, etc.)
 */

export * from "./claude-models";
export * from "./claude-audit";
export * from "./claude-client";
export * from "./claude-structured";
export * from "./claude-tools";
export * from "./claude-recipes";
