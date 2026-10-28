import { OPENAI_MODELS } from "../ai-models";
import { isProductionDeployment } from "../deployment-environment";
import { openAIResponsesCreate, type OpenAIResponsesResponse } from "../openai-responses-api";
import type { CloudBrowserConnection } from "./browser-session";

/** Cloud computer fails closed without OpenAI and an isolated hosted browser. */
const ALLOWED_MODELS = new Set<string>([
  OPENAI_MODELS.GPT_5_6_TERRA,
  OPENAI_MODELS.GPT_5_6_LUNA,
  OPENAI_MODELS.GPT_5_6_SOL,
]);

export function cloudComputerModel(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CLOUD_COMPUTER_MODEL?.trim();
  return configured && ALLOWED_MODELS.has(configured) ? configured : OPENAI_MODELS.GPT_5_6_TERRA;
}

export function cloudComputerConnection(
  env: NodeJS.ProcessEnv = process.env,
  production = isProductionDeployment(),
): CloudBrowserConnection | null {
  let remote = env.CLOUD_COMPUTER_BROWSER_WS_URL?.trim();
  if (!remote && env.BROWSERBASE_API_KEY?.trim()) {
    const key = env.BROWSERBASE_API_KEY.trim();
    remote = `wss://connect.browserbase.com/?apiKey=${encodeURIComponent(key)}&timeout=900000`;
  }
  if (remote) {
    try {
      const endpoint = new URL(remote);
      const secure = endpoint.protocol === "wss:";
      const local = endpoint.protocol === "ws:" && !production;
      // The browser network guard depends on Playwright request routing. CDP
      // connections do not support context.route(), so fail closed unless the
      // hosted provider exposes its native Playwright WebSocket endpoint or
      // Browserbase's isolated CDP endpoint which supports context request routing.
      const supportsRouting =
        endpoint.pathname.replace(/\/+$/, "").endsWith("/playwright") ||
        endpoint.hostname === "connect.browserbase.com" ||
        endpoint.hostname.endsWith(".browserbase.com");
      if (!(secure || local) || !supportsRouting) return null;
      // The provider's total session clock includes time waiting for the owner.
      // Never assume the account's plan limit or request an unbounded session.
      const override = env.CLOUD_COMPUTER_BROWSER_TIMEOUT_MS?.trim();
      const existing = endpoint.searchParams.getAll("timeout");
      if (!override && existing.length > 1) return null;
      const configured = override || existing[0];
      if (configured !== undefined) {
        const timeout = Number(configured);
        if (
          !/^\d+$/.test(configured) ||
          !Number.isSafeInteger(timeout) ||
          timeout < 60_000 ||
          timeout > 3_600_000
        )
          return null;
        if (override) endpoint.searchParams.set("timeout", String(timeout));
      }
      return { kind: "remote", wsEndpoint: override ? endpoint.toString() : remote };
    } catch {
      return null;
    }
  }
  const executable = env.CLOUD_COMPUTER_LOCAL_CHROMIUM_PATH?.trim();
  if (executable && !production) return { kind: "local", executablePath: executable };
  return null;
}

export type CloudComputerReadiness =
  { available: true } | { available: false; reason: "model_unconfigured" | "browser_unconfigured" };

export function cloudComputerReadiness(
  env: NodeJS.ProcessEnv = process.env,
): CloudComputerReadiness {
  if (!env.OPENAI_API_KEY?.trim()) return { available: false, reason: "model_unconfigured" };
  if (!cloudComputerConnection(env)) return { available: false, reason: "browser_unconfigured" };
  return { available: true };
}

export type CloudComputerClient = {
  responses: {
    create(body: Record<string, unknown>): Promise<OpenAIResponsesResponse>;
  };
};

/** Uses the same server-side OpenAI project key as the voice/runtime paths. */
export function cloudComputerClient(): CloudComputerClient {
  return { responses: { create: openAIResponsesCreate } };
}

/** Concurrent tasks this process will run. Each holds one remote browser. */
export function cloudComputerProcessCapacity(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.CLOUD_COMPUTER_MAX_CONCURRENT);
  return Number.isInteger(value) && value >= 1 && value <= 20 ? value : 3;
}
