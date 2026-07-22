import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
  VAPI_VOICE_FALLBACK_MODEL,
  resolveVapiVoiceModelSelection,
} from "../src/lib/ai-models";

/**
 * Managed PSTN / Vapi voice model policy tests.
 * Live browser/mobile voice runs through the dedicated Grok voice-profile path
 * covered in src/lib/voice/grok-voice-config.test.ts.
 * This suite keeps the Vapi-managed OpenAI/Gemini/OpenRouter routing stable.
 */

describe("managed PSTN voice model policy", () => {
  it("keeps OpenAI as the managed primary and Gemini as its native fallback", () => {
    const selection = resolveVapiVoiceModelSelection();
    expect(selection.provider).toBe(VAPI_TENANT_DEFAULT_PROVIDER);
    expect(selection.model).toBe(VAPI_TENANT_DEFAULT_MODEL);
    expect(selection.fallbackModels).toEqual([VAPI_VOICE_FALLBACK_MODEL]);
  });

  it("keeps an explicit native Gemini choice and uses OpenAI as its fallback", () => {
    const selection = resolveVapiVoiceModelSelection({
      provider: "google",
      model: "gemini-3.5-flash",
    });
    expect(selection.provider).toBe("google");
    expect(selection.model).toBe("gemini-3.5-flash");
    expect(selection.fallbackModels).toEqual([VAPI_TENANT_DEFAULT_MODEL]);
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

  it("retries rejected Gemini outbound models through OpenAI, not Gemini again", () => {
    const vapi = readFileSync(resolve(process.cwd(), "src/lib/vapi-client.ts"), "utf8");
    expect(vapi).toContain("retrying with OpenAI voice fallback");
    expect(vapi).toContain("voiceSelection.fallbackModels?.find");
    expect(vapi).not.toMatch(
      /provider: VAPI_VOICE_FALLBACK_PROVIDER,\s*model: VAPI_VOICE_FALLBACK_MODEL/,
    );
  });
});
