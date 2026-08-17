import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCoherentVoiceModel } from "../src/lib/ai-models";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Behavioral coverage for the bugs the adversarial double-pass surfaced in the
 * comprehensive-review changes. Each `it` pins a fix that would otherwise
 * regress silently (the source-reading contracts elsewhere lock the wiring;
 * these exercise real behavior where the function is pure).
 */
describe("coherent voice-model resolution (no cross-source downgrade)", () => {
  it("uses the agent's complete pair when both fields are set", () => {
    const sel = resolveCoherentVoiceModel(
      { llmProvider: "google", llmModel: "gemini-2.5-flash" },
      { voiceLlmProvider: "openai", voiceLlmModel: "gpt-4o" },
    );
    expect(sel.provider).toBe("google");
    expect(sel.model).toBe("gemini-2.5-flash");
  });

  it("does NOT cross the agent provider with the tenant model (the regression)", () => {
    // Agent set only a provider; tenant runs Gemini. The old interleave produced
    // openai+gemini → collapsed to the gpt-4o default, discarding the tenant's
    // Gemini choice. The coherent resolver ignores the incomplete agent pair and
    // honors the tenant's complete Gemini pair instead.
    const sel = resolveCoherentVoiceModel(
      { llmProvider: "openai", llmModel: null },
      { voiceLlmProvider: "google", voiceLlmModel: "gemini-2.5-flash" },
    );
    expect(sel.provider).toBe("google");
    expect(sel.model).toBe("gemini-2.5-flash");
  });

  it("falls back to the managed default when neither pair is complete", () => {
    const sel = resolveCoherentVoiceModel(
      { llmProvider: "openai", llmModel: null },
      { voiceLlmProvider: null, voiceLlmModel: "gpt-4o" },
    );
    // Default is xAI Grok 4.3 on Vapi; the key point is it never emits an incoherent pair.
    expect(sel.provider).toBe("xai");
    expect(sel.model).toBe("grok-4.3");
  });

  it("handles null agent/tenant without throwing", () => {
    const sel = resolveCoherentVoiceModel(null, null);
    expect(sel.provider).toBeTruthy();
    expect(sel.model).toBeTruthy();
  });
});

describe("simulation quota is fully plumbed (no contract drift)", () => {
  it("appears in both quota-routes usage and the published OpenAPI schema", () => {
    const routes = read("src/routes/quota-routes.ts");
    // Both the internal usage list AND the response object must include it, or
    // GET /api/quotas returns a limits key with no matching usage key.
    expect(routes.match(/simulation_minutes_daily/g)?.length).toBeGreaterThanOrEqual(2);
    const openapi = read("src/lib/openapi-managed-runtime.ts");
    // limits + usage each declare it (schema has additionalProperties:false).
    expect(openapi.match(/simulation_minutes_daily/g)?.length).toBeGreaterThanOrEqual(2);
  });
});
