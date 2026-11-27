/**
 * src/lib/cloud-computer/takeover-urls.ts
 *
 * Takeover URL Resolver for Cloud Computer.
 * Resolves the lowest-friction interactive takeover link for the business owner:
 * 1. Primary: Direct Browserbase live debug canvas (`debuggerFullscreenUrl`)
 * 2. Fallback: Internal BotBound Studio interactive takeover URL (`/computer?taskId=...&takeover=true`)
 */

import { Browserbase } from "@browserbasehq/sdk";
import { resolveCanonicalAppUrl } from "../app-url";
import { log } from "../server-context";

export interface TakeoverUrls {
  primaryUrl: string; // Direct Browserbase debugger or Studio takeover link
  fallbackUrl: string; // BotBound Studio internal URL
  provider: "browserbase" | "studio";
}

/**
 * Resolves the lowest-friction interactive takeover link for the business owner.
 */
export async function resolveTakeoverUrl(input: {
  taskId: string;
  browserbaseSessionId?: string | null;
  env?: NodeJS.ProcessEnv;
}): Promise<TakeoverUrls> {
  const env = input.env || process.env;
  const canonicalApp = resolveCanonicalAppUrl();
  const baseAppUrl = "url" in canonicalApp ? canonicalApp.url : "https://app.botbound.com";
  const fallbackUrl = `${baseAppUrl}/computer?taskId=${encodeURIComponent(input.taskId)}&takeover=true`;

  const apiKey = env.BROWSERBASE_API_KEY?.trim();
  if (input.browserbaseSessionId && apiKey) {
    try {
      const bb = new Browserbase({ apiKey });
      const live = await bb.sessions.debug(input.browserbaseSessionId);
      if (live?.debuggerFullscreenUrl) {
        return {
          primaryUrl: live.debuggerFullscreenUrl,
          fallbackUrl,
          provider: "browserbase",
        };
      }
    } catch (error) {
      log.warn("[takeover-urls] Failed to retrieve Browserbase debug URL; falling back to Studio", {
        taskId: input.taskId,
        sessionId: input.browserbaseSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    primaryUrl: fallbackUrl,
    fallbackUrl,
    provider: "studio",
  };
}
