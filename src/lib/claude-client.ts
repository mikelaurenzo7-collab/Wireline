/**
 * Claude Client Singleton
 * ---------------------------------------------------------------------------
 * Manages the Anthropic SDK client lifecycle, availability checks, and
 * custom error types.
 */

import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;
export function getClient(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new ClaudeUnavailableError();
    }
    // Per-request timeout: a stalled Anthropic call would otherwise tie up
    // an Express handler indefinitely. 120s is long enough for adaptive
    // thinking on the deep-analysis paths, short enough to fail fast on
    // network blips. The SDK retries idempotent failures up to maxRetries
    // within that budget.
    _client = new Anthropic({
      timeout: 120_000,
      maxRetries: 2,
    });
  }
  return _client;
}

export class ClaudeUnavailableError extends Error {
  status = 503;
  constructor() {
    super("Claude Brain is offline — set ANTHROPIC_API_KEY to enable advanced features.");
    this.name = "ClaudeUnavailableError";
  }
}

export function isClaudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
