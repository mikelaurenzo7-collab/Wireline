import { describe, expect, it } from "vitest";

import {
  composeOpenAILiveInstructions,
  type OpenAILiveInstructionAgent,
} from "../src/lib/voice/openai-live-agent-service";
import {
  composeOpenAIRealtimeInstructions,
  type OpenAIRealtimeInstructionAgent,
  type OpenAIRealtimeTenantSettings,
} from "../src/lib/voice/openai-phone-agent-runtime";

const businessAgent: OpenAILiveInstructionAgent = {
  id: "acme-front-desk",
  userId: "acme-owner",
  name: "Alex",
  role: "front desk",
  firstMessage: null,
  personalityVibe: "warm",
  systemPromptOverride:
    "Our drain cleanout is $190. BotBound Starter is $19/month. Keep answers brief.",
  complianceMode: "none",
  disallowedTopics: null,
  escalationKeywords: null,
  escalationPhone: null,
  escalationEmail: null,
  businessVariables: null,
  playbook: {
    version: 1,
    exactLines: {},
    situations: [],
    alwaysMention: [
      "BotBound plans cost $19/month. Our annual maintenance agreement is $1900.",
    ],
    neverSay: [],
  },
};

const phoneAgent: OpenAIRealtimeInstructionAgent = {
  ...businessAgent,
  enabledTools: null,
  timezone: "America/Chicago",
  kpiFocus: null,
  voiceProvider: "openai",
  voiceId: "coral",
  phoneVoiceId: "coral",
};

const tenant: OpenAIRealtimeTenantSettings = {
  aiTier: null,
  twilioMessagingEnabled: true,
  twilioLookupEnabled: false,
  businessName: "Acme Plumbing",
};

describe("BotBound pricing prompt scope", () => {
  it("keeps the account holder's prices and removes retired BotBound claims", () => {
    const directives = [
      { content: "Our maintenance membership is $19/month." },
      { content: "BotBound pricing starts at $19/month. Confirm the caller's ZIP code." },
    ];
    const knowledge = [
      { content: "An emergency visit is $1900. BotBound Starter is $19/month." },
      { content: "A standard visit is $190." },
    ];
    const personality =
      "Our care plan is $19/month. BotBound Starter is $19/month. Speak clearly.";
    const prompts = [
      composeOpenAILiveInstructions(businessAgent, personality, directives, knowledge),
      composeOpenAIRealtimeInstructions({
        agent: phoneAgent,
        tenant,
        personality,
        directives,
        knowledge,
        surface: "phone",
      }),
    ];

    for (const prompt of prompts) {
      expect(prompt).toContain("Our drain cleanout is $190.");
      expect(prompt).toContain("Our maintenance membership is $19/month.");
      expect(prompt).toContain("Our care plan is $19/month.");
      expect(prompt).toContain("Speak clearly.");
      expect(prompt).toContain("An emergency visit is $1900.");
      expect(prompt).toContain("A standard visit is $190.");
      expect(prompt).toContain("Confirm the caller's ZIP code.");
      expect(prompt).toContain("Our annual maintenance agreement is $1900.");
      expect(prompt).not.toContain("BotBound Starter is $19/month");
      expect(prompt).not.toContain("BotBound pricing starts at $19/month");
      expect(prompt).not.toContain("BotBound plans cost $19/month");
      expect(prompt).not.toContain("CURRENT BOTBOUND PRICING");
      expect(prompt).not.toContain("Starter is $24/month");
    }
  });
});
