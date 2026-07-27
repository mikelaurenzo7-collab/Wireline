import { RuntimeUnavailableError } from "./ai-client";
import { getErrorMessage } from "./server-utils";

/**
 * Map provider/runtime failures to an actionable SSE `error` message.
 * Avoids a generic "could not generate" when the real cause is missing/blocked AI.
 */
export function publicAiStreamFailureMessage(error: unknown, fallback: string): string {
  const msg = getErrorMessage(error);
  if (
    error instanceof RuntimeUnavailableError ||
    /AI runtime is unavailable/i.test(msg) ||
    /API_KEY_SERVICE_BLOCKED/i.test(msg) ||
    /Requests to this API[\s\S]*are blocked/i.test(msg) ||
    (/403/.test(msg) && /generativelanguage|Gemini|OpenAI|googleapis/i.test(msg))
  ) {
    return "AI is temporarily unavailable. Configure a reachable AI provider (OpenAI, Gemini, or AI Gateway), then try again.";
  }
  return fallback;
}
