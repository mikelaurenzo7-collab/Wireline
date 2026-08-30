import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { gatewayModelId } from "../src/lib/ai-gateway";
import {
  DEFAULT_REASONING_PROVIDER,
  REASONING_PROVIDER_ORDER,
  normalizeReasoningProvider,
  orderReasoningProviders,
  resolveReasoningPreference,
  type ReasoningProviderId,
} from "../src/lib/reasoning-provider-policy";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const ALL: ReasoningProviderId[] = ["openai", "gateway", "gemini"];

describe("structured runtime provider chain policy", () => {
  it("keeps OpenAI first with only governed continuity lanes", () => {
    expect(DEFAULT_REASONING_PROVIDER).toBe("openai");
    expect([...REASONING_PROVIDER_ORDER]).toEqual(ALL);
    expect(orderReasoningProviders(ALL)).toEqual(ALL);
    expect(resolveReasoningPreference({} as NodeJS.ProcessEnv)).toBe("openai");
  });

  it("accepts current aliases and rejects retired providers", () => {
    expect(normalizeReasoningProvider("google")).toBe("gemini");
    expect(normalizeReasoningProvider("ai-gateway")).toBe("gateway");
    expect(normalizeReasoningProvider("vercel")).toBe("gateway");
    expect(normalizeReasoningProvider("xai")).toBeNull();
    expect(normalizeReasoningProvider("grok")).toBeNull();
    expect(normalizeReasoningProvider("vapi")).toBeNull();
  });

  it("promotes an available operator preference without losing continuity", () => {
    expect(orderReasoningProviders(ALL, "gemini")).toEqual([
      "gemini",
      "openai",
      "gateway",
    ]);
    expect(orderReasoningProviders(["openai", "gemini"], "gateway")).toEqual([
      "openai",
      "gemini",
    ]);
  });

  it("normalizes stale Grok Gateway ids before generic provider ids", () => {
    expect(gatewayModelId("xai/grok-4.6")).toMatch(/^openai\//);
    expect(gatewayModelId("grok-4.6")).toMatch(/^openai\//);
    expect(gatewayModelId("google/gemini-3.6-flash")).toBe("google/gemini-3.6-flash");
  });
});

describe("structured runtime transport", () => {
  it("contains no native xAI or Vapi transport", () => {
    const client = read("src/lib/ai-client.ts");
    const models = read("src/lib/ai-models.ts");
    expect(client).toContain('endpoint: "https://api.openai.com/v1/responses"');
    expect(client).toContain("gatewayModels: models");
    expect(client).toContain("provider request failed; trying fallback");
    expect(client).toContain("if (isAbortError(error, options?.signal)) throw error");
    expect(client).not.toMatch(/api\.x\.ai|XAI_API_KEY|callXAI|grok/i);
    expect(models).not.toMatch(/XAI_|GROK_/);
  });
});
