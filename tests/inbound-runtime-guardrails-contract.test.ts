import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

/**
 * Inbound and outbound PSTN calls must run the SAME config surface.
 *
 * History this contract prevents from regressing:
 * - systemPromptOverride must reach the shared Realtime instruction composer,
 *   rather than only a browser test surface.
 * - buildAgentRuntimeContext (disallowed topics, compliance disclosure,
 *   escalation keywords, business hours, personality vibe, voice
 *   consistency) ran only on outbound, so inbound callers could pull the
 *   agent into disallowed topics and after-hours inbound behaved as if the
 *   business were open.
 * - No call had a duration ceiling, so worst-case COGS per call was unbounded.
 *
 * Production PSTN is native Twilio + OpenAI Realtime SIP. Browser and phone
 * sessions share the same saved identity and voice configuration.
 */
describe("inbound/outbound runtime parity contract", () => {
  const factory = read("src/lib/voice/openai-phone-agent-runtime.ts");
  const session = read("src/lib/voice/openai-sip-session.ts");
  const admission = read("src/lib/voice/native-inbound-admission.ts");
  const placement = read("src/lib/voice/outbound-call-service.ts");
  const bridge = read("src/routes/openai-outbound-routes.ts");

  it("inbound factory honors the Account Holder system prompt override", () => {
    expect(factory).toContain("trimLine(input.agent.systemPromptOverride, 8_000)");
    expect(factory).toContain("CUSTOM ROLE INSTRUCTIONS");
    expect(factory).toContain("systemPromptOverride: schema.agents.systemPromptOverride");
  });

  it("inbound factory layers the runtime guardrails like outbound does", () => {
    expect(factory).toContain("input.agent.disallowedTopics");
    expect(factory).toContain("input.agent.personalityVibe");
    expect(factory).toContain("RUNTIME_ACTION_SAFETY_BLOCK");
    expect(factory).toContain("RUNTIME_VOICE_DELIVERY_CONSISTENCY_BLOCK");
  });

  it("after-hours inbound switches to message-taking instead of pretending to be open", () => {
    expect(admission).toContain("after_hours");
    expect(admission).toContain("isWithinBusinessHours");
    expect(admission).toContain("outOfHoursMessage");
    expect(session).toContain("export function applyInboundAdmission");
    expect(session).toContain("AFTER-HOURS MODE");
  });

  it("both call directions carry a hard duration ceiling", () => {
    expect(session).toContain("resolveOpenAISipSessionMaxSeconds()");
    expect(bridge).toContain("resolveOpenAISipSessionMaxSeconds()");
  });

  it("phone and Studio honor the same saved OpenAI voice before role defaults", () => {
    const studio = read("src/lib/voice/openai-live-agent-service.ts");
    expect(factory).toContain("parseOpenAIRealtimeVoice(input.voiceId)");
    expect(factory).toContain("parseOpenAIRealtimeVoice(input.phoneVoiceId)");
    expect(studio).toContain("parseOpenAIRealtimeVoice(input.voiceId)");
    expect(studio).toContain("parseOpenAIRealtimeVoice(input.phoneVoiceId)");
    expect(factory).toContain("OPENAI_REALTIME_DEFAULT_MODEL");
  });

  it("outbound machine detection drops when no approved OpenAI audio is deployed", () => {
    expect(placement).toContain("machineDetection");
    expect(bridge).toContain('amdAction === "drop" || amdAction === "voicemail"');
    expect(bridge).toContain(
      'const effectiveAmdAction = amdAction === "voicemail" ? "drop" : amdAction',
    );
    expect(bridge).toContain("amd_action: effectiveAmdAction");
    expect(bridge).toContain("no approved OpenAI-generated fallback audio is deployed");
    expect(bridge).not.toContain("voicemailTwiml");
    expect(bridge).not.toContain("openai-static-prompts");
    expect(bridge).toContain("AnsweredBy");
    expect(read("src/lib/voice/native-outbound-amd.ts")).toContain("DetectMessageEnd");
  });

  it("retains reproducible future OpenAI prompt copy without activating it", () => {
    const generator = read("scripts/generate-openai-static-prompts.mjs");
    expect(generator).toContain("openai-outbound-voicemail.mp3");
    expect(generator).toContain("return the call using the number shown on your caller ID");
    expect(bridge).not.toContain("openai-outbound-voicemail.mp3");
  });

  it("both directions use one deterministic summary and durable QA pipeline", () => {
    const digest = read("src/lib/post-call-digest.ts");
    expect(session).toContain("deterministicSummary(input.transcript)");
    expect(session).toContain(
      'direction === "outbound" ? "openai_sip_outbound" : "openai_sip_inbound"',
    );
    expect(digest).toContain('type: "auto_qa_score"');
  });
});
