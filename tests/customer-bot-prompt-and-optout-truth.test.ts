import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { FOUNDER_FLEET_SEED_CONTRACT_VERSION } from "../src/lib/founder-internal-runtime-policy";
import { founderShowcaseAgentId } from "../src/lib/founder-showcase-seed";
import { callerTurnsText } from "../src/lib/post-call-digest";
import { detectOptOut } from "../src/lib/tcpa-consent";
import {
  FOUNDER_SHOWCASE_AGENT_ID_PREFIX,
  botSellsBotBound,
} from "../src/lib/usage-billing-catalog";
import {
  composeOpenAILiveInstructions,
  type OpenAILiveInstructionAgent,
} from "../src/lib/voice/openai-live-agent-service";
import {
  composeOpenAIRealtimeInstructions,
  type OpenAIRealtimeInstructionAgent,
} from "../src/lib/voice/openai-phone-agent-runtime";
import { WIRELINE_PERSONAS } from "../src/lib/wireline-agent-personas";

const PRICE_HEADING = "CURRENT BOTBOUND PRICING";

function liveAgent(id: string, businessVariables: unknown = {}): OpenAILiveInstructionAgent {
  return {
    id,
    userId: "abcdefgh-owner",
    name: "Ava",
    role: "receptionist",
    firstMessage: null,
    personalityVibe: "warm",
    systemPromptOverride: null,
    complianceMode: "none",
    disallowedTopics: null,
    escalationKeywords: null,
    escalationPhone: null,
    escalationEmail: null,
    businessVariables,
  };
}

function phoneAgent(id: string, businessVariables: unknown = {}): OpenAIRealtimeInstructionAgent {
  return {
    ...liveAgent(id, businessVariables),
    enabledTools: null,
    timezone: null,
    kpiFocus: null,
    voiceProvider: "openai",
    voiceId: "marin",
    phoneVoiceId: "marin",
  };
}

function prompts(id: string, businessVariables: unknown = {}, personality = "Be helpful.") {
  return [
    composeOpenAILiveInstructions(liveAgent(id, businessVariables), personality, [], []),
    composeOpenAIRealtimeInstructions({
      agent: phoneAgent(id, businessVariables),
      tenant: {
        aiTier: null,
        twilioMessagingEnabled: false,
        twilioLookupEnabled: false,
        businessName: "Riverside Plumbing",
      },
      personality,
      directives: [],
      knowledge: [],
      surface: "phone",
    }),
  ];
}

describe("a customer's Bot never quotes BotBound's prices", () => {
  it("leaves BotBound's price list out of an ordinary Bot, on calls and in rehearsal", () => {
    for (const prompt of prompts("11111111-1111-4111-8111-111111111111")) {
      expect(prompt).not.toContain(PRICE_HEADING);
      expect(prompt).not.toContain("Quote only these prices");
    }
  });

  it("keeps it for BotBound's own internal personas and showcase Bots", () => {
    const internal = {
      wireline_internal: true,
      wireline_persona_id: "support",
      founder_seed_contract_version: FOUNDER_FLEET_SEED_CONTRACT_VERSION,
    };
    for (const prompt of prompts(
      "wireline-support",
      internal,
      WIRELINE_PERSONAS.support.systemPrompt,
    )) {
      expect(prompt).toContain(PRICE_HEADING);
    }
    const showcaseId = founderShowcaseAgentId("abcdefgh-owner", "Ava");
    expect(showcaseId.startsWith(FOUNDER_SHOWCASE_AGENT_ID_PREFIX)).toBe(true);
    for (const prompt of prompts(showcaseId, { founder_showcase: true })) {
      expect(prompt).toContain(PRICE_HEADING);
    }
  });

  it("does not let a tenant opt in by copying a showcase flag", () => {
    expect(botSellsBotBound({ agentId: "agent-0123456789", internalPersona: false })).toBe(false);
    for (const prompt of prompts("agent-0123456789", { founder_showcase: true })) {
      expect(prompt).not.toContain(PRICE_HEADING);
    }
  });
});

describe("post-call opt-out scan", () => {
  const salesTranscript = [
    "Agent: This call uses an automated AI assistant on behalf of Riverside Plumbing. You can say stop calling at any time to be placed on the do not call list. This call may be recorded for quality and compliance.",
    "Caller: Sure, what's this about?",
    "Agent: You asked about a water heater quote last week.",
    "Caller: Yes, send it over please.",
  ].join("\n");

  it("ignores the Bot's own opt-out announcement", () => {
    // The whole transcript matches the Bot's own words, which is the bug.
    expect(detectOptOut(salesTranscript).kind).toBe("dnc");
    expect(detectOptOut(callerTurnsText(salesTranscript)).found).toBe(false);
  });

  it("still records a caller who asks to stop", () => {
    const optedOut = `${salesTranscript}\nCaller: Actually, please stop calling me.`;
    expect(detectOptOut(callerTurnsText(optedOut))).toMatchObject({ kind: "dnc" });
  });

  it("is what both post-call suppression paths scan", () => {
    const session = readFileSync(
      resolve(process.cwd(), "src/lib/voice/openai-sip-session.ts"),
      "utf8",
    );
    expect(session).toContain("detectOptOut(callerTurnsText(input.transcript))");
    expect(session).toContain("detectOptOut(callerTurnsText(transcript))");
    expect(session).not.toContain('detectOptOut(input.transcript || "")');
    // The live, per-utterance detector already reads caller speech only.
    expect(session).toMatch(
      /input_audio_transcription\.completed"[\s\S]{0,400}detectOptOut\(transcript\)/,
    );
  });
});
