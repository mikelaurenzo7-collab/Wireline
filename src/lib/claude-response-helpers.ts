/**
 * src/lib/claude-response-helpers.ts
 *
 * Shared response utilities for Claude-backed endpoints.
 * Extracted from server.ts so route files can import these without
 * creating a circular dependency back to the monolith.
 */

import * as claudeBrain from "./claude-brain";
import { SentryEvents } from "./sentry-events";
import { getErrorMessage } from "./server-utils";
import { log } from "./server-context";

/**
 * Standard error responder for Claude endpoints.
 * Surfaces known Anthropic error shapes to the client and swallows
 * internal stack traces / file paths so they don't leak.
 */
export function claudeErr(res: any, e: any, endpoint: string = "/api/claude"): void {
  if (e instanceof claudeBrain.ClaudeUnavailableError) {
    SentryEvents.aiApiFailure({
      endpoint,
      error_message: e.message,
      model: "claude",
    });
    res.status(503).json({
      error: e.message,
      code: "CLAUDE_OFFLINE",
    });
    return;
  }

  const errorMsg = getErrorMessage(e);
  log.error("Claude endpoint error", { error: errorMsg, endpoint });
  SentryEvents.aiApiFailure({
    endpoint,
    error_message: errorMsg,
    model: "claude",
  });

  // Surface known Anthropic SDK error shapes (rate limit, validation,
  // overload) — these are useful to the client. Otherwise return a
  // generic message so internal stack traces / file paths don't leak.
  const isKnownApiError =
    e?.status >= 400 &&
    e?.status < 600 &&
    typeof e?.message === "string" &&
    e.message.length < 500;

  res.status(500).json({
    error: isKnownApiError ? e.message : "Claude request failed",
  });
}
