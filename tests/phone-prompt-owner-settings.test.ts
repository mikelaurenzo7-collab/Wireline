import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { businessHoursContext } from "../src/lib/agent-runtime";
import { composeSetupPersonality } from "../src/lib/compose-setup-personality";
import {
  composeOpenAIRealtimeInstructions,
  type OpenAIRealtimeInstructionAgent,
  type OpenAIRealtimeTenantSettings,
} from "../src/lib/voice/openai-phone-agent-runtime";

/**
 * What an owner sets has to reach the call. An audit found three things an
 * owner chose in Set Up that the phone Bot was never told: the tone, the day
 * and time, and the opening hours.
 */
const weekday = { open: "08:00", close: "17:00" };
const agent: OpenAIRealtimeInstructionAgent = {
  id: "agent-owner-settings",
  userId: "owner-settings",
  name: "Sam",
  role: "receptionist",
  firstMessage: null,
  personalityVibe: null,
  systemPromptOverride: null,
  complianceMode: null,
  disallowedTopics: null,
  escalationKeywords: null,
  escalationPhone: null,
  escalationEmail: null,
  businessVariables: null,
  enabledTools: [],
  timezone: "America/Chicago",
  businessHours: {
    mon: weekday,
    tue: weekday,
    wed: weekday,
    thu: weekday,
    fri: weekday,
    sat: { closed: true },
    sun: { closed: true },
  },
  kpiFocus: null,
  voiceProvider: "openai",
  voiceId: "coral",
  phoneVoiceId: null,
};
const tenant: OpenAIRealtimeTenantSettings = {
  aiTier: null,
  twilioMessagingEnabled: false,
  twilioLookupEnabled: false,
  businessName: "Ridge Dental",
};

const compose = (
  overrides: Partial<OpenAIRealtimeInstructionAgent> = {},
  personality = "",
  surface: "phone" | "browser_test" = "phone",
) =>
  composeOpenAIRealtimeInstructions({
    agent: { ...agent, ...overrides },
    tenant,
    personality,
    directives: [],
    knowledge: [],
    surface,
  });

beforeEach(() => {
  vi.useFakeTimers();
  // Friday 27 November 2026, 3:42 in the afternoon in Chicago.
  vi.setSystemTime(new Date("2026-11-27T21:42:00Z"));
});
afterEach(() => vi.useRealTimers());

describe("the tone an owner chose", () => {
  it("reaches the call even when the saved role text is longer than the cut", () => {
    const role =
      `You are an elite receptionist. ${"Handle the call completely. ".repeat(70)}`.trim();
    const saved = composeSetupPersonality(role, "Concise");
    expect(saved.indexOf("## DELIVERY TONE")).toBeGreaterThan(1_500);
    const prompt = compose({}, saved);
    expect(prompt).toContain("TONE:\nDelivery tone: Concise. Concise, useful, and discreet.");
    // Rehearsal hears the same tone the call does.
    expect(compose({}, saved, "browser_test")).toContain(
      "TONE:\nDelivery tone: Concise. Concise, useful, and discreet.",
    );
  });
});

describe("the day, the time and the opening hours", () => {
  it("tells the Bot the weekday and the clock, not only the date", () => {
    const prompt = compose();
    expect(prompt).toContain("Today is 2026-11-27.");
    expect(prompt).toContain("It is Friday 3:42 PM there as this conversation starts.");
  });

  it("gives the Bot the saved hours in plain words, and whether it is open now", () => {
    const prompt = compose();
    expect(prompt).toContain(
      "BUSINESS HOURS (America/Chicago): Monday to Friday 8 AM to 5 PM. Saturday to Sunday closed.",
    );
    expect(prompt).toContain("The business is open right now.");
    expect(prompt).toContain("They are opening hours, not appointment availability.");
    // The hours sit with the time context, ahead of the owner's own content.
    expect(prompt.indexOf("BUSINESS HOURS")).toBeGreaterThan(prompt.indexOf("TIME CONTEXT:"));
    expect(prompt.indexOf("BUSINESS HOURS")).toBeLessThan(
      prompt.indexOf("## ACTION AND RESULT SAFETY"),
    );

    // Saturday morning: closed.
    vi.setSystemTime(new Date("2026-11-28T16:00:00Z"));
    expect(compose()).toContain("The business is closed right now.");
    // After five on a weekday: closed.
    vi.setSystemTime(new Date("2026-11-27T23:30:00Z"));
    expect(compose()).toContain("The business is closed right now.");
  });

  it("says nothing about hours nobody saved", () => {
    for (const businessHours of [undefined, null, {}]) {
      expect(compose({ businessHours })).not.toContain("BUSINESS HOURS");
      expect(businessHoursContext({ businessHours, timezone: "America/Chicago" })).toBe("");
    }
  });
});

/**
 * A prompt over the size limit is cut from the end of the owner's content.
 * The topics not to discuss, the escalation triggers, and the Playbook's
 * never-say and check-first lists were at that end: a Bot with long custom
 * instructions lost every one of them, and nothing said so.
 */
describe("what the owner ruled out", () => {
  const limits = {
    playbook: {
      alwaysMention: ["Free estimates"],
      neverSay: ["guarantee"],
      checkFirst: ["A customer asks for a discount"],
    },
    disallowedTopics: ["competitor pricing"],
    escalationKeywords: ["lawsuit"],
  };
  const HEADING = "## LIMITS SET BY THE ACCOUNT HOLDER";

  it("is printed once, beside the fixed safety text", () => {
    const prompt = compose(limits as never);
    expect(prompt.indexOf(HEADING)).toBeGreaterThan(prompt.indexOf("PLAYBOOK (set by"));
    expect(prompt.indexOf(HEADING)).toBeLessThan(prompt.indexOf("## ACTION AND RESULT SAFETY"));
    expect(prompt).toContain("Do not discuss: competitor pricing.");
    expect(prompt).toContain("Escalate or take a message when the caller raises: lawsuit.");
    expect(prompt.match(/Never say, claim, or promise:/g)).toHaveLength(1);
    expect(prompt.match(/Check with the account holder first\./g)).toHaveLength(1);
    // The rest of the Playbook stays where it was.
    expect(prompt).toContain("Always mention, when it fits the conversation:\n- Free estimates");
    // An owner who ruled nothing out gets no empty heading.
    expect(compose()).not.toContain(HEADING);
  });

  it("survives a prompt that has to be cut to fit", () => {
    const prompt = composeOpenAIRealtimeInstructions({
      agent: {
        ...agent,
        ...limits,
        systemPromptOverride: "Follow the script. ".repeat(420),
      } as never,
      tenant,
      personality: "",
      directives: Array.from({ length: 24 }, (_, index) => ({
        content: `Rule ${index}: ${"always confirm the detail. ".repeat(25)}`,
      })),
      knowledge: Array.from({ length: 24 }, (_, index) => ({
        content: `Fact ${index}: ${"we serve the whole county. ".repeat(4)}`,
      })),
      surface: "phone",
    });
    expect(prompt.length).toBeLessThanOrEqual(18_000);
    expect(prompt).toContain("[Context trimmed");
    // Facts and rules gave way. What the owner ruled out did not.
    expect(prompt).not.toContain("Fact 23:");
    expect(prompt).toContain(HEADING);
    expect(prompt).toContain("Do not discuss: competitor pricing.");
    expect(prompt).toContain("Escalate or take a message when the caller raises: lawsuit.");
    expect(prompt).toContain("Never say, claim, or promise:\n- guarantee");
    expect(prompt).toContain("- A customer asks for a discount");
    expect(prompt).toContain("## ACTION AND RESULT SAFETY");
    expect(prompt).toContain("## VOICE AND DELIVERY CONSISTENCY");
  });
});

describe("the voice rehearsal", () => {
  it("prints the owner's limits the way a call does", async () => {
    const { readFileSync } = await import("node:fs");
    const rehearsal = readFileSync("src/lib/voice/openai-live-agent-service.ts", "utf8");
    expect(rehearsal).toContain("ownerLimitsBlock({");
    expect(rehearsal).toContain("playbookPromptBlock(agent.playbook, { withoutLimits: true })");
    expect(rehearsal).toContain('ownerLimits ? `\\n${ownerLimits}` : "",');
    // A customer's own prices are not mistaken for BotBound's retired ones.
    expect(rehearsal).toContain(
      '? knowledge.filter((item) => !isStaleBotBoundPricing(item.content ?? ""))',
    );
  });
});

/**
 * The fixed rules contradicted an owner's Playbook and each other. The owner's
 * hold line had to be said word for word while two later rules allowed only
 * "One sec.", and the scripted "I'm not sure" promised a call back that the
 * rest of the instructions forbid promising.
 */
describe("fixed rules that used to contradict the owner", () => {
  it("lets the Playbook's hold line stand, and promises no call back", async () => {
    const { readFileSync } = await import("node:fs");
    const prompt = compose();
    expect(prompt).toContain(
      'say "One sec." and then answer; when the Playbook gives a line for asking the caller to wait, say that line instead.',
    );
    expect(prompt).toContain(`"I'm not sure. I can take a message for the team."`);
    expect(prompt).not.toContain("have someone get back to you");
    expect(readFileSync("src/lib/voice/openai-sip-session.ts", "utf8")).toContain(
      "line for asking the caller to wait when there is one. When it finishes, give only the result, once.",
    );
    // A Bot with no cloud computer is not told how to use one.
    const withTools = (toolNames: string[]) =>
      composeOpenAIRealtimeInstructions({
        agent,
        tenant,
        personality: "",
        directives: [],
        knowledge: [],
        surface: "phone",
        toolNames,
      });
    expect(withTools(["search_knowledge_base"])).not.toContain("CLOUD COMPUTER BROWSER");
    expect(withTools(["start_computer_task"])).toContain(
      "call start_computer_task and tell the caller once, in a few words, that you are looking it up.",
    );
    // The stored default says nothing a Bot can act on.
    expect(compose({ complianceMode: "standard" })).not.toContain("Compliance mode");
    expect(compose({ complianceMode: "hipaa" })).toContain("Compliance mode: hipaa.");
  });
});
