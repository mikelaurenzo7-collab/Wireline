/**
 * claude-models.test.ts
 * ----------------------------------------------------------------------
 * Tests for LLM tiering — specifically `resolveVapiVoiceModelSelection`,
 * the one function that decides which model handles a live voice call.
 *
 * If this function returns the wrong provider/model, Vapi rejects the
 * assistant create-or-update payload and we silently lose the call.
 * Every branch matters.
 */
import { describe, expect, it } from "vitest";
import {
  CLAUDE_MODELS,
  CLAUDE_MODEL_DEFAULT,
  CLAUDE_REASONING_MODEL_DEFAULT,
  GEMINI_MODELS,
  VAPI_TENANT_DEFAULT_MODEL,
  VAPI_TENANT_DEFAULT_PROVIDER,
  VAPI_PREMIUM_MODEL,
  VAPI_SHOWCASE_MODEL,
  resolveVapiVoiceModelSelection,
  selectModelForTask,
  MODEL_PRICING,
} from "./claude-models";

describe("Wireline LLM tiering — constants are stable", () => {
  it("voice runtime defaults to Sonnet 4.6 (smart + low TTFT)", () => {
    expect(VAPI_TENANT_DEFAULT_PROVIDER).toBe("anthropic");
    expect(VAPI_TENANT_DEFAULT_MODEL).toBe(CLAUDE_MODELS.SONNET);
    expect(VAPI_TENANT_DEFAULT_MODEL).toBe("claude-sonnet-4-6");
  });

  it("reasoning default is Opus; voice default is Sonnet (distinct tiers)", () => {
    expect(CLAUDE_REASONING_MODEL_DEFAULT).toBe(CLAUDE_MODELS.OPUS);
    expect(CLAUDE_MODEL_DEFAULT).toBe(CLAUDE_REASONING_MODEL_DEFAULT);
    expect(VAPI_TENANT_DEFAULT_MODEL).toBe(CLAUDE_MODELS.SONNET);
    expect(CLAUDE_REASONING_MODEL_DEFAULT).not.toBe(VAPI_TENANT_DEFAULT_MODEL);
  });

  it("showcase + premium voice run the same Sonnet 4.6 as tenants", () => {
    // Drift between showcase and tenant breaks "the demo line uses the
    // same engine real customers do" promise on the landing page.
    expect(VAPI_SHOWCASE_MODEL).toBe(VAPI_TENANT_DEFAULT_MODEL);
    expect(VAPI_PREMIUM_MODEL).toBe(CLAUDE_MODELS.SONNET);
  });

  it("MODEL_PRICING has entries for every current Claude tier", () => {
    expect(MODEL_PRICING[CLAUDE_MODELS.HAIKU]).toBeDefined();
    expect(MODEL_PRICING[CLAUDE_MODELS.SONNET]).toBeDefined();
    expect(MODEL_PRICING[CLAUDE_MODELS.OPUS]).toBeDefined();
  });

  it("Opus pricing matches Anthropic Opus 4.x list rates ($5/$25 per 1M)", () => {
    expect(MODEL_PRICING[CLAUDE_MODELS.OPUS]).toEqual({
      input: 5,
      output: 25,
      cacheRead: 0.5,
      cacheWrite: 6.25,
    });
  });
});

describe("resolveVapiVoiceModelSelection", () => {
  it("returns the tenant default when called with no input", () => {
    expect(resolveVapiVoiceModelSelection()).toEqual({
      provider: "anthropic",
      model: CLAUDE_MODELS.SONNET,
    });
    expect(resolveVapiVoiceModelSelection({})).toEqual({
      provider: "anthropic",
      model: CLAUDE_MODELS.SONNET,
    });
  });

  describe("Anthropic family normalization", () => {
    it("lands on Sonnet 4.6 for bare 'anthropic' provider with no model", () => {
      expect(resolveVapiVoiceModelSelection({ provider: "anthropic" })).toEqual({
        provider: "anthropic",
        model: CLAUDE_MODELS.SONNET,
      });
    });

    it("preserves an explicit model id verbatim (operator knows best)", () => {
      // The resolver only NORMALISES when the operator gave us an alias
      // or nothing. Explicit ids are passed through to Vapi as-is so
      // operators can pin pre-release / experimental models without
      // a deploy. Vapi rejects unknown ids; that's the right place
      // for the validation to happen.
      const out = resolveVapiVoiceModelSelection({ model: "claude" });
      expect(out.provider).toBe("anthropic");
      expect(out.model).toBe("claude");
    });

    it("honors an explicit Opus pick (reasoning-class voice)", () => {
      const out = resolveVapiVoiceModelSelection({ model: "claude-opus-4-7" });
      expect(out.provider).toBe("anthropic");
      expect(out.model).toContain("opus");
    });

    it("honors an explicit Haiku pick", () => {
      expect(resolveVapiVoiceModelSelection({ model: "claude-haiku-4-5" })).toEqual({
        provider: "anthropic",
        model: CLAUDE_MODELS.HAIKU,
      });
    });

    it("never attaches a cross-provider fallback list on Anthropic (Vapi rejects them)", () => {
      const out = resolveVapiVoiceModelSelection({ provider: "anthropic" });
      // Critical contract: Anthropic responses MUST omit fallbackModels.
      expect("fallbackModels" in out).toBe(false);
    });
  });

  describe("Google family normalization", () => {
    it("returns the canonical Gemini 3.5 Flash for bare 'google' provider with no model", () => {
      expect(resolveVapiVoiceModelSelection({ provider: "google" })).toEqual({
        provider: "google",
        model: GEMINI_MODELS.FLASH_3_5,
      });
    });

    it("preserves an explicit gemini-* id verbatim (operator pins win)", () => {
      const out = resolveVapiVoiceModelSelection({ model: "gemini-2.0-pro" });
      expect(out.provider).toBe("google");
      expect(out.model).toBe("gemini-2.0-pro");
    });

    it("normalises Gemini flash aliases to the GA model id", () => {
      const aliases = [
        "gemini-3-flash",
        "gemini-3.5-flash",
        "gemini-3-flash-preview",
        "gemini-2.5-flash-latest",
        "gemini-flash-latest",
      ];
      for (const a of aliases) {
        const out = resolveVapiVoiceModelSelection({ model: a });
        expect(out.provider).toBe("google");
        expect(out.model).toBe(GEMINI_MODELS.FLASH_3_5);
      }
    });
  });

  describe("OpenAI family normalization", () => {
    it("recognises gpt-* / o-series prefixes and attaches a fallback", () => {
      const out = resolveVapiVoiceModelSelection({ model: "gpt-4o" });
      expect(out.provider).toBe("openai");
      expect(out.model).toBe("gpt-4o");
    });

    it("falls back to gpt-4o when given bare provider:openai", () => {
      const out = resolveVapiVoiceModelSelection({ provider: "openai" });
      expect(out.provider).toBe("openai");
      expect(out.model).toBe("gpt-4o");
    });
  });

  it("falls through to tenant default for unknown providers", () => {
    expect(resolveVapiVoiceModelSelection({ provider: "cohere", model: "command-r-plus" })).toEqual(
      {
        provider: VAPI_TENANT_DEFAULT_PROVIDER,
        model: VAPI_TENANT_DEFAULT_MODEL,
      },
    );
  });
});

describe("selectModelForTask", () => {
  it("routes by complexity tier", () => {
    expect(selectModelForTask("simple")).toBe(CLAUDE_MODELS.HAIKU);
    expect(selectModelForTask("medium")).toBe(CLAUDE_MODELS.SONNET);
    expect(selectModelForTask("complex")).toBe(CLAUDE_MODELS.OPUS);
  });

  it("falls back to Sonnet for unknown complexity (the balanced default)", () => {
    expect(selectModelForTask("nonsense" as never)).toBe(CLAUDE_MODELS.SONNET);
  });
});
