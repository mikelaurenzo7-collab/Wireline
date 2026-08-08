import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VAPI_OPENAI_FALLBACK_MODEL,
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
  VAPI_VOICE_FALLBACK_MODEL,
  resolveVapiVoiceModelSelection,
} from "../src/lib/ai-models";

/**
 * Managed PSTN / Vapi voice model policy tests.
 * Live browser/mobile voice runs through OpenAI Realtime
 * (`src/lib/voice/openai-live-agent-service.ts` / Studio sandbox).
 * Vapi validates fallbackModels inside the selected provider's model enum, so
 * cross-provider continuity must remain an application retry rather than being
 * encoded inside the provider payload.
 */

describe("managed PSTN voice model policy", () => {
  it("keeps OpenAI as primary with a same-provider fallback", () => {
    const selection = resolveVapiVoiceModelSelection();
    expect(selection.provider).toBe(VAPI_TENANT_DEFAULT_PROVIDER);
    expect(selection.model).toBe(VAPI_TENANT_DEFAULT_MODEL);
    expect(selection.fallbackModels).toEqual([VAPI_OPENAI_FALLBACK_MODEL]);
    expect(selection.fallbackModels?.every((model) => /^gpt-/i.test(model))).toBe(true);
  });

  it("keeps an explicit native Gemini choice without an invalid OpenAI fallbackModels value", () => {
    const selection = resolveVapiVoiceModelSelection({
      provider: "google",
      model: "gemini-3.5-flash",
    });
    expect(selection.provider).toBe("google");
    expect(selection.model).toBe("gemini-3.5-flash");
    expect(selection.fallbackModels).toBeUndefined();
  });

  it("does not repeat the primary model as its own fallback", () => {
    const selection = resolveVapiVoiceModelSelection({
      provider: "openai",
      model: VAPI_OPENAI_FALLBACK_MODEL,
    });
    expect(selection.provider).toBe("openai");
    expect(selection.model).toBe(VAPI_OPENAI_FALLBACK_MODEL);
    expect(selection.fallbackModels).toBeUndefined();
  });

  it("normalizes retired OpenRouter selections back to the managed chain", () => {
    const selection = resolveVapiVoiceModelSelection({
      provider: "openrouter",
      model: "x-ai/grok-4.5",
    });
    expect(selection.provider).toBe(VAPI_TENANT_DEFAULT_PROVIDER);
    expect(selection.model).toBe(VAPI_TENANT_DEFAULT_MODEL);
    expect(selection.fallbackModels).toEqual([VAPI_VOICE_FALLBACK_MODEL]);
  });

  it("rejects unknown providers and returns to the managed chain", () => {
    const selection = resolveVapiVoiceModelSelection({
      provider: "unknown",
      model: "not a valid model id",
    });
    expect(selection.provider).toBe(VAPI_TENANT_DEFAULT_PROVIDER);
    expect(selection.fallbackModels).toEqual([VAPI_VOICE_FALLBACK_MODEL]);
  });

  it("retries rejected Gemini outbound models through OpenAI at the application layer", () => {
    const vapi = readFileSync(resolve(process.cwd(), "src/lib/vapi-client.ts"), "utf8");
    expect(vapi).toContain("retrying with OpenAI voice fallback");
    // Whitespace-tolerant: prettier may wrap the fallback expression across lines.
    expect(vapi).toMatch(/\|\|\s+VAPI_TENANT_DEFAULT_MODEL/);
    expect(vapi).toContain("delete fallbackPayload.assistant.model.fallbackModels");
  });
});
