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
 *
 * Production PSTN is native Twilio + xAI SIP. The Vapi factory remains the
 * rollback assistant builder and is still pinned so that path cannot silently
 * lose guardrails while it exists.
 */
describe("inbound/outbound runtime parity contract", () => {
  const factory = read("src/lib/vapi-assistant-factory-v2.ts");
  const session = read("src/lib/voice/xai-sip-session.ts");
  const nativeRuntime = read("src/lib/voice/xai-agent-runtime.ts");
  const admission = read("src/lib/voice/native-inbound-admission.ts");
  const placement = read("src/lib/voice/outbound-call-service.ts");
  const bridge = read("src/routes/xai-outbound-routes.ts");

  it("inbound factory honors the Account Holder system prompt override", () => {
    expect(factory).toContain("resolveAssistantBasePrompt");
    expect(factory).toContain("configured.systemPromptOverride");
    expect(nativeRuntime).toContain("systemPromptOverride");
    expect(nativeRuntime).toContain("CUSTOM ROLE INSTRUCTIONS");
  });

  it("inbound factory layers the runtime guardrails like outbound does", () => {
    expect(factory).toContain("buildAgentRuntimeContext");
    expect(factory).toContain("disallowed_topics: configured.disallowedTopics");
    expect(factory).toContain("personality_vibe: configured.personalityVibe");
    expect(nativeRuntime).toContain("disallowedTopics");
    expect(nativeRuntime).toContain("personalityVibe");
  });

  it("after-hours inbound switches to message-taking instead of pretending to be open", () => {
    expect(factory).toContain("AFTER-HOURS MODE");
    expect(factory).toContain("runtime.outOfHoursMessage");
    expect(admission).toContain("after_hours");
    expect(admission).toContain("isWithinBusinessHours");
    expect(admission).toContain("outOfHoursMessage");
    expect(session).toContain("AFTER-HOURS MODE");
  });

  it("both call directions carry a hard duration ceiling", () => {
    expect(factory).toContain("maxDurationSeconds");
    expect(session).toContain("resolveXAISipSessionMaxSeconds()");
    expect(bridge).toContain("resolveXAISipSessionMaxSeconds()");
  });

  it("outbound respects the per-agent brain as a coherent pair, then tenant defaults", () => {
    // Rollback Vapi still uses resolveCoherentVoiceModel. Native PSTN is one
    // Speech-to-Speech roster; Studio and phone share grok-voice-think-fast-2.0.
    expect(factory).toContain("resolveCoherentVoiceModel(configured, userSettings)");
    expect(nativeRuntime).toContain("resolveWirelineGrokVoice(runtime.agent.role, profile)");
    expect(read("src/lib/vapi-client.ts")).not.toContain("resolveCoherentVoiceModel");
  });

  it("outbound uses native voicemail detection with a deterministic fallback message", () => {
    expect(placement).toContain("machineDetection");
    expect(bridge).toContain("buildOutboundVoicemailMessage(");
    expect(bridge).toContain("AnsweredBy");
    expect(read("src/lib/voice/native-outbound-amd.ts")).toContain("DetectMessageEnd");
  });

  it("voicemail fallback never discloses call context (FDCPA-safe)", () => {
    const message = buildOutboundVoicemailMessage("Riley");
    expect(message).toContain("Riley");
    expect(message).not.toMatch(/debt|invoice|balance|payment|collection/i);
    // Signature stays context-free: identity + callback inputs only (agent
    // name, business name, callback number) — never WHY we called.
    expect(buildOutboundVoicemailMessage.length).toBe(3);
  });

  it("voicemail fallback states the responsible business and callback number when known", () => {
    // 64.1200(b)(1)/(b)(2): an artificial-voice answering-machine message must
    // identify the responsible business and state a callback number — caller
    // ID is not a statement. Degrades to identity-only when unconfigured.
    const full = buildOutboundVoicemailMessage("Riley", "Acme Plumbing", "415-555-0134");
    expect(full).toContain("Riley with Acme Plumbing");
    expect(full).toContain("reach us at 415-555-0134");
    // No duplicate naming when the agent is named after the business.
    const dedup = buildOutboundVoicemailMessage("Acme Plumbing", "Acme Plumbing", null);
    expect(dedup).not.toContain("with Acme Plumbing");
    expect(dedup).toContain("reach us back at this number");
  });

  it("call analysis includes success evaluation on BOTH call directions", () => {
    // Rollback Vapi still ships one shared analysis plan. Native SIP uses the
    // same deterministic transcript summary for inbound and outbound so the
    // two directions cannot drift onto different post-call brains.
    const profile = read("src/lib/voice-agent-profile.ts");
    expect(profile).toContain("VAPI_ANALYSIS_PLAN");
    expect(profile).toContain("successEvaluationPrompt");
    expect(factory).toContain("analysisPlan: VAPI_ANALYSIS_PLAN");
    expect(session).toContain("deterministicSummary(input.transcript)");
    expect(read("src/lib/vapi-client.ts")).not.toContain("analysisPlan: VAPI_ANALYSIS_PLAN");
  });
});
