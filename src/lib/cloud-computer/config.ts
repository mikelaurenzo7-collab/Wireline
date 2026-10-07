import type Anthropic from "@anthropic-ai/sdk";

import { ANTHROPIC_MODELS } from "../ai-models";
import { isProductionDeployment } from "../deployment-environment";
import type { CloudBrowserConnection } from "./browser-session";

/**
 * Cloud computer configuration. Every value is server-owned and the feature
 * fails closed: without an Anthropic key and an isolated browser endpoint the
 * workspace shows the computer as unavailable instead of running anything.
 */

const ALLOWED_MODELS = new Set<string>(Object.values(ANTHROPIC_MODELS));

export function cloudComputerModel(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.CLOUD_COMPUTER_MODEL?.trim();
  return configured && ALLOWED_MODELS.has(configured) ? configured : ANTHROPIC_MODELS.OPUS_5_5;
}

export function cloudComputerConnection(
  env: NodeJS.ProcessEnv = process.env,
  production = isProductionDeployment(),
): CloudBrowserConnection | null {
  const remote = env.CLOUD_COMPUTER_BROWSER_WS_URL?.trim();
  if (remote) {
    // Production requires an encrypted endpoint to the isolated browser host.
    const secure = remote.startsWith("wss://");
    const local = remote.startsWith("ws://") && !production;
    return secure || local ? { kind: "remote", wsEndpoint: remote } : null;
  }
  const executable = env.CLOUD_COMPUTER_LOCAL_CHROMIUM_PATH?.trim();
  // A browser inside BotBound's own network is for development only.
  if (executable && !production) return { kind: "local", executablePath: executable };
  return null;
}

export type CloudComputerReadiness =
  { available: true } | { available: false; reason: "model_unconfigured" | "browser_unconfigured" };

export function cloudComputerReadiness(
  env: NodeJS.ProcessEnv = process.env,
): CloudComputerReadiness {
  if (!env.ANTHROPIC_API_KEY?.trim()) return { available: false, reason: "model_unconfigured" };
  if (!cloudComputerConnection(env)) return { available: false, reason: "browser_unconfigured" };
  return { available: true };
}

/** Concurrent tasks this process will run. Each holds one remote browser. */
export function cloudComputerProcessCapacity(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.CLOUD_COMPUTER_MAX_CONCURRENT);
  return Number.isInteger(value) && value >= 1 && value <= 20 ? value : 3;
}

export type AnthropicSdk = typeof import("@anthropic-ai/sdk");

let sdk: Promise<AnthropicSdk> | null = null;
let client: Anthropic | null = null;

/** The SDK loads with the first task, so API cold starts never pay for it. */
export function loadAnthropicSdk(): Promise<AnthropicSdk> {
  sdk ??= import("@anthropic-ai/sdk");
  return sdk;
}

export async function cloudComputerClient(): Promise<Anthropic> {
  if (!client) {
    const { default: AnthropicClient } = await loadAnthropicSdk();
    client = new AnthropicClient({
      apiKey: process.env.ANTHROPIC_API_KEY?.trim(),
      // Retries happen in the task runner, one metered reservation each; an
      // SDK retry would bill an attempt the spend meter never sees.
      maxRetries: 0,
      // A full 8k-token turn with adaptive thinking can run past two minutes.
      timeout: 300_000,
    });
  }
  return client;
}
