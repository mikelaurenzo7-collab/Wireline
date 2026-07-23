import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { buildOutboundVoicemailMessage } from "../src/lib/voice-agent-profile";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Inbound and outbound PSTN calls must run the SAME config surface.
 *
 * History this contract prevents from regressing:
 * - systemPromptOverride was documented in schema.ts as replacing the base
 *   identity "at call time" but only the Grok test sandbox read it — real
 *   inbound calls silently dropped the Account Holder's custom prompt.
 * - buildAgentRuntimeContext (disallowed topics, compliance disclosure,
 *   escalation keywords, business hours, personality vibe, voice
 *   consistency) ran only on outbound, so inbound callers could pull the
 *   agent into disallowed topics and after-hours inbound behaved as if the
 *   business were open.
 * - Per-agent llmProvider/llmModel/llmTemperature were honored inbound but
 *   ignored outbound — the same agent got a different brain per direction.
 * - No call had a duration ceiling, so worst-case COGS per call was bounded
 *   only by the Vapi account default.
 */
describe("inbound/outbound runtime parity contract", () => {
  const factory = read("src/lib/vapi-assistant-factory-v2.ts");
  const outbound = read("src/lib/vapi-client.ts");

  it("inbound factory honors the Account Holder system prompt override", () => {
    expect(factory).toContain("resolveAssistantBasePrompt");
    expect(factory).toContain("configured.systemPromptOverride");
  });

  it("inbound factory layers the runtime guardrails like outbound does", () => {
    expect(factory).toContain("buildAgentRuntimeContext");
    expect(factory).toContain("disallowed_topics: configured.disallowedTopics");
    expect(factory).toContain("personality_vibe: configured.personalityVibe");
  });

  it("after-hours inbound switches to message-taking instead of pretending to be open", () => {
    expect(factory).toContain("AFTER-HOURS MODE");
    expect(factory).toContain("runtime.outOfHoursMessage");
  });

  it("both call directions carry a hard duration ceiling", () => {
    expect(factory).toContain("maxDurationSeconds");
    expect(outbound).toContain("maxDurationSeconds: VAPI_MAX_OUTBOUND_CALL_SECONDS");
  });

  it("outbound respects the per-agent brain before tenant defaults", () => {
    expect(outbound).toMatch(/agentConfig\.llmProvider\s*\|\|\s*settings\?\.voiceLlmProvider/);
    expect(outbound).toMatch(/agentConfig\.llmModel\s*\|\|\s*settings\?\.voiceLlmModel/);
    expect(outbound).toContain("clampVoiceTemperature(agentConfig.llmTemperature");
  });

  it("outbound uses native voicemail detection with a deterministic fallback message", () => {
    expect(outbound).toContain("voicemailDetection: VAPI_VOICEMAIL_DETECTION_PLAN");
    expect(outbound).toContain("voicemailMessage: buildOutboundVoicemailMessage(");
  });

  it("voicemail fallback never discloses call context (FDCPA-safe)", () => {
    const message = buildOutboundVoicemailMessage("Riley");
    expect(message).toContain("Riley");
    expect(message).not.toMatch(/debt|invoice|balance|payment|collection/i);
    // Signature stays context-free: identity + callback only.
    expect(buildOutboundVoicemailMessage.length).toBe(1);
  });

  it("call analysis includes success evaluation for the agent scorecard", () => {
    expect(factory).toContain("successEvaluationPrompt");
  });
});
