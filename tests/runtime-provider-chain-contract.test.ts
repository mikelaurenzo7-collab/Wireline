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
const ALL: ReasoningProviderId[] = ["xai", "openai", "gateway"];

describe("structured runtime provider chain policy", () => {
  it("keeps xAI first with OpenAI as the backup", () => {
    expect(DEFAULT_REASONING_PROVIDER).toBe("xai");
    expect([...REASONING_PROVIDER_ORDER]).toEqual(ALL);
    expect(orderReasoningProviders(ALL)).toEqual(ALL);
    expect(resolveReasoningPreference({} as NodeJS.ProcessEnv)).toBe("xai");
  });

  it("accepts current aliases and rejects retired providers", () => {
    expect(normalizeReasoningProvider("grok")).toBe("xai");
    expect(normalizeReasoningProvider("ai-gateway")).toBe("gateway");
    expect(normalizeReasoningProvider("vercel")).toBe("gateway");
    expect(normalizeReasoningProvider("gemini")).toBeNull();
    expect(normalizeReasoningProvider("google")).toBeNull();
    expect(normalizeReasoningProvider("vapi")).toBeNull();
  });

  it("promotes an available operator preference without losing continuity", () => {
    expect(orderReasoningProviders(ALL, "openai")).toEqual(["openai", "xai", "gateway"]);
    // A missing primary key skips that lane rather than failing the request.
    expect(orderReasoningProviders(["openai", "gateway"])).toEqual(["openai", "gateway"]);
  });

  it("keeps the legacy Gateway on OpenAI models", () => {
    expect(gatewayModelId("xai/grok-4.6")).toMatch(/^openai\//);
    expect(gatewayModelId("grok-4.6")).toMatch(/^openai\//);
  });
});

describe("structured runtime transport", () => {
  it("calls xAI first, falls back to OpenAI, and never reaches Gemini", () => {
    const client = read("src/lib/ai-client.ts");
    expect(client).toContain('endpoint: "https://api.x.ai/v1/responses"');
    expect(client).toContain('endpoint: "https://api.openai.com/v1/responses"');
    // xAI stores responses for 30 days unless told not to.
    expect(client.slice(client.indexOf("async function callXAI"))).toContain("store: false");
    expect(client).toContain("gatewayModels: models");
    expect(client).toContain("provider request failed; trying fallback");
    const abortedAttempt = client.slice(
      client.indexOf("if (isAbortError(error, options?.signal))"),
      client.indexOf("const providerError = definiteRejection ?? error"),
    );
    expect(abortedAttempt).toContain("recordAmbiguousProviderAttempt()");
    expect(abortedAttempt).toContain("throw error");
    expect(abortedAttempt.indexOf("recordAmbiguousProviderAttempt()")).toBeLessThan(
      abortedAttempt.indexOf("throw error"),
    );
    expect(client).not.toMatch(/gemini|generativelanguage|@google\/generative-ai/i);
  });
});
