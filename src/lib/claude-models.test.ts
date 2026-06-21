import { describe, expect, it } from "vitest";
import {
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
  VAPI_VOICE_FALLBACK_MODEL,
  isOpenRouterModelId,
  resolveVapiVoiceModelSelection,
} from "./ai-models";

describe("managed voice model policy", () => {
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

  it("passes any valid explicit OpenRouter model through unchanged", () => {
    const model = "x-ai/grok-4.3";
    const selection = resolveVapiVoiceModelSelection({ provider: "openrouter", model });
    expect(selection).toEqual({ provider: "openrouter", model, userSelected: true });
  });

  it("rejects malformed OpenRouter IDs and returns to the managed chain", () => {
    expect(isOpenRouterModelId("anthropic/claude sonnet")).toBe(false);
    const selection = resolveVapiVoiceModelSelection({
      provider: "openrouter",
      model: "not a valid model id",
    });
    expect(selection.provider).toBe(VAPI_TENANT_DEFAULT_PROVIDER);
    expect(selection.fallbackModels).toEqual([VAPI_VOICE_FALLBACK_MODEL]);
  });
});
