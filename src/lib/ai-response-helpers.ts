/* eslint-disable @typescript-eslint/no-explicit-any */
import { RuntimeUnavailableError } from "./ai-client";
import { SentryEvents } from "./sentry-events";
import { getErrorMessage } from "./server-utils";
import { log } from "./server-context";

export function aiErr(res: any, error: any, endpoint = "/api/ai"): void {
  if (error instanceof RuntimeUnavailableError) {
    SentryEvents.aiApiFailure({ endpoint, error_message: error.message, model: "openai" });
    res.status(503).json({ error: error.message, code: "AI_RUNTIME_OFFLINE" });
    return;
  }
  const message = getErrorMessage(error);
  log.error("AI endpoint error", { error: message, endpoint });
  SentryEvents.aiApiFailure({ endpoint, error_message: message, model: "openai" });
  const isKnownApiError = error?.status >= 400 && error?.status < 600 && typeof error?.message === "string" && error.message.length < 500;
  res.status(500).json({ error: isKnownApiError ? error.message : "AI request failed" });
}
