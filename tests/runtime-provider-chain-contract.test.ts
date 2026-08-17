import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_REASONING_PROVIDER,
  REASONING_PROVIDER_ORDER,
  isXAIStructuredLaneEnabled,
  normalizeReasoningProvider,
  orderReasoningProviders,
  resolveReasoningPreference,
  type ReasoningProviderId,
} from "../src/lib/reasoning-provider-policy";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");
const client = read("src/lib/ai-client.ts");
const models = read("src/lib/ai-models.ts");
const realtime = read("src/lib/voice/openai-realtime-config.ts");

const ALL: ReasoningProviderId[] = ["openai", "gemini", "gateway", "xai"];

describe("structured runtime provider chain policy", () => {
  it("defaults to xAI, then OpenAI, then Gemini, then the AI Gateway", () => {
    expect(DEFAULT_REASONING_PROVIDER).toBe("xai");
    expect([...REASONING_PROVIDER_ORDER]).toEqual(["xai", "openai", "gemini", "gateway"]);
    expect(orderReasoningProviders(ALL)).toEqual(["xai", "openai", "gemini", "gateway"]);
  });

  it("keeps the managed default when no preference is configured", () => {
    expect(resolveReasoningPreference({} as NodeJS.ProcessEnv)).toBe("xai");
  });

  it("ignores an unrecognized preference instead of routing traffic off-policy", () => {
    expect(
      resolveReasoningPreference({
        WIRELINE_STRUCTURED_PRIMARY_PROVIDER: "not-a-provider",
      } as NodeJS.ProcessEnv),
    ).toBe("xai");
    expect(normalizeReasoningProvider("not-a-provider")).toBeNull();
    expect(normalizeReasoningProvider("")).toBeNull();
    expect(normalizeReasoningProvider(undefined)).toBeNull();
  });

  it("accepts the vendor aliases operators actually type", () => {
    expect(normalizeReasoningProvider("grok")).toBe("xai");
    expect(normalizeReasoningProvider("XAI")).toBe("xai");
    expect(normalizeReasoningProvider("google")).toBe("gemini");
    expect(normalizeReasoningProvider("ai-gateway")).toBe("gateway");
    expect(normalizeReasoningProvider("vercel")).toBe("gateway");
  });

  it("promotes an explicitly preferred provider without dropping continuity", () => {
    expect(orderReasoningProviders(ALL, "openai")).toEqual(["openai", "xai", "gemini", "gateway"]);
    expect(orderReasoningProviders(ALL, "gemini")).toEqual(["gemini", "xai", "openai", "gateway"]);
  });

  it("ignores a preference for a provider that is not configured", () => {
    expect(orderReasoningProviders(["openai", "gemini"], "xai")).toEqual(["openai", "gemini"]);
  });

  it("preserves relative order for whatever subset is configured", () => {
    expect(orderReasoningProviders(["gateway", "openai"])).toEqual(["openai", "gateway"]);
    expect(orderReasoningProviders(["xai"])).toEqual(["xai"]);
    expect(orderReasoningProviders([])).toEqual([]);
  });

  it("treats a configured xAI key as an active continuity lane by default", () => {
    expect(isXAIStructuredLaneEnabled({} as NodeJS.ProcessEnv)).toBe(true);
    expect(
      isXAIStructuredLaneEnabled({
        WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK: "true",
      } as NodeJS.ProcessEnv),
    ).toBe(true);
  });

  it("keeps an explicit operator opt-out for the xAI lane", () => {
    for (const value of ["false", "FALSE", "0", "off"]) {
      expect(
        isXAIStructuredLaneEnabled({
          WIRELINE_ENABLE_XAI_STRUCTURED_FALLBACK: value,
        } as NodeJS.ProcessEnv),
      ).toBe(false);
    }
  });
});

describe("structured runtime transport", () => {
  it("routes each lane to its documented endpoint", () => {
    expect(client).toContain('endpoint: "https://api.openai.com/v1/responses"');
    expect(client).toContain('const XAI_RESPONSES_URL = "https://api.x.ai/v1/responses"');
    expect(models).toContain(
      "export const STRUCTURED_PRIMARY_MODEL = XAI_STRUCTURED_PRIMARY_MODEL",
    );
    expect(models).toContain('GROK_4_6: "grok-4.6"');
  });

  it("delegates eligibility and ordering to the policy module", () => {
    expect(client).toContain("orderReasoningProviders(available, resolveReasoningPreference())");
    expect(client).toContain("isXAIStructuredLaneEnabled() && Boolean(process.env.XAI_API_KEY)");
    // Every lane in the policy must have a transport entry, or a configured
    // credential would resolve to a provider the client cannot call.
    for (const id of REASONING_PROVIDER_ORDER) {
      expect(client).toContain(`  ${id}: {`);
    }
  });

  it("makes the resolved chain observable on the platform-admin health surface", () => {
    // The operator toggle is only trustworthy if its effect can be seen.
    // Names only — the payload builder must never carry credentials or model ids.
    const health = read("src/routes/health-routes.ts");
    expect(health).toContain("structured_runtime_chain: describeRuntimeChain()");
    expect(health).toMatch(
      /\/integrations",\s*\n\s*healthRateLimiter,\s*\n\s*authenticateUser,\s*\n\s*requirePlatformAdmin/,
    );
  });

  it("routes primary turns to current explicit OpenAI model IDs", () => {
    expect(client).toContain("OPENAI_STRUCTURED_PRIMARY_MODEL");
    expect(client).toContain(
      'requested.startsWith("gpt-") ? requested : OPENAI_STRUCTURED_PRIMARY_MODEL',
    );
    expect(models).toContain('GPT_5_6_TERRA: "gpt-5.6-terra"');
    expect(models).toContain('GPT_5_6_SOL: "gpt-5.6-sol"');
    expect(models).toContain(
      "process.env.WIRELINE_OPENAI_STRUCTURED_MODEL?.trim() || OPENAI_MODELS.GPT_5_6_TERRA",
    );
    expect(realtime).toContain('OPENAI_REALTIME_MODEL || "gpt-realtime-2.1"');
    expect(realtime).toContain('OPENAI_REALTIME_TRANSCRIBER || "gpt-4o-mini-transcribe"');
  });

  it("only forwards xAI-native model ids on the xAI lane", () => {
    expect(client).toContain("/grok/i.test(requested) ? requested : XAI_STRUCTURED_PRIMARY_MODEL");
  });

  it("logs each fallback advance with the provider it is trying next", () => {
    expect(client).toContain("xAI request failed; trying OpenAI fallback");
    expect(client).toContain("OpenAI request failed; trying Gemini fallback");
    expect(client).toContain("Gemini request failed; trying AI Gateway fallback");
  });

  it("does not turn an aborted request into another provider call", () => {
    expect(client).toContain("if (isAbortError(error, options?.signal)) throw error");
    expect(client).toContain("assertNotAborted(options?.signal)");
  });

  it("keeps provider response details in server logs instead of propagated errors", () => {
    expect(client).toContain('log.warn("[ai-runtime] provider request rejected"');
    expect(client).toContain(
      "throw new Error(`${args.provider} Responses request failed (${response.status})`)",
    );
    expect(client).not.toContain(
      "`${args.provider} Responses request failed (${response.status}): ${(await response.text()).slice(0, 500)}`",
    );
  });
});
