import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { businessHoursContext } from "../src/lib/agent-runtime";
import { composeSetupPersonality } from "../src/lib/compose-setup-personality";
import { DEFAULT_NATIVE_CALENDAR } from "../src/lib/native-calendar-policy";
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
    expect(prompt).toContain("It is Friday 3:42 PM there, and the business is open right now.");
    expect(prompt).toContain("They are opening hours, not appointment availability.");
    // The hours sit with the time context, ahead of the owner's own content.
    expect(prompt.indexOf("BUSINESS HOURS")).toBeGreaterThan(prompt.indexOf("TIME CONTEXT:"));
    expect(prompt.indexOf("BUSINESS HOURS")).toBeLessThan(
      prompt.indexOf("## ACTION AND RESULT SAFETY"),
    );

    // Saturday morning: closed.
    vi.setSystemTime(new Date("2026-11-28T16:00:00Z"));
    expect(compose()).toContain("and the business is closed right now.");
    // After five on a weekday: closed.
    vi.setSystemTime(new Date("2026-11-27T23:30:00Z"));
    expect(compose()).toContain("and the business is closed right now.");
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
    expect(prompt).toContain("Do not discuss:\n- competitor pricing");
    expect(prompt).toContain("Escalate or take a message when the caller raises:\n- lawsuit");
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
    expect(prompt).toContain("Do not discuss:\n- competitor pricing");
    expect(prompt).toContain("Escalate or take a message when the caller raises:\n- lawsuit");
    expect(prompt).toContain("Never say, claim, or promise:\n- guarantee");
    expect(prompt).toContain("- A customer asks for a discount");
    expect(prompt).toContain("## ACTION AND RESULT SAFETY");
    expect(prompt).toContain("## VOICE AND DELIVERY CONSISTENCY");
  });

  // An independent review ran these two cases against the first version of
  // this block and found fixed text cut that had been kept before.
  const calendar = {
    ...structuredClone(DEFAULT_NATIVE_CALENDAR),
    enabled: true,
    time_zone: "America/Chicago",
    booking_mode: "approval",
  };
  const longPrompt = (overrides: Record<string, unknown>, nativeCalendar?: unknown) =>
    composeOpenAIRealtimeInstructions({
      agent: { ...agent, ...overrides } as never,
      tenant: { ...tenant, ...(nativeCalendar ? { nativeCalendar } : {}) } as never,
      personality: "",
      directives: Array.from({ length: 24 }, (_, index) => ({
        content: `Rule ${index}: ${"always confirm the detail. ".repeat(25)}`,
      })),
      knowledge: [],
      surface: "phone",
    });

  it("keeps the compliance mode when long instructions and lists compete for room", () => {
    const prompt = longPrompt({
      complianceMode: "hipaa",
      systemPromptOverride: "Follow the script. ".repeat(210),
      playbook: {
        neverSay: Array.from(
          { length: 10 },
          (_, index) => `never-say item ${index} ${"x".repeat(150)}`,
        ),
        checkFirst: Array.from(
          { length: 5 },
          (_, index) => `check-first item ${index} ${"y".repeat(150)}`,
        ),
      },
    });
    expect(prompt.length).toBeLessThanOrEqual(18_000);
    expect(prompt).toContain(
      "COMPLIANCE: HIPAA\nTreat all caller-provided health information as PHI:",
    );
    expect(prompt).toContain("- never-say item 9");
    expect(prompt).toContain("- check-first item 4");
  });

  it("gives way from its own end before the fixed opening of the prompt does", () => {
    const item = (label: string, index: number) => `${label} ${index} ${"z".repeat(100)}`;
    const everything = {
      complianceMode: "hipaa",
      disallowedTopics: Array.from({ length: 24 }, (_, index) => item("topic", index)),
      escalationKeywords: Array.from({ length: 24 }, (_, index) => item("trigger", index)),
      playbook: {
        neverSay: Array.from({ length: 15 }, (_, index) => item("never", index).padEnd(190, "n")),
        checkFirst: Array.from({ length: 10 }, (_, index) => item("check", index).padEnd(190, "c")),
      },
    };
    const prompt = longPrompt(everything);
    expect(prompt.length).toBeLessThanOrEqual(18_000);
    const opening = prompt.slice(0, prompt.indexOf("[Context trimmed"));
    // The fixed opening is whole: identity, the call rules, the time, the hours.
    expect(opening).toContain("You are Sam.");
    expect(opening).toContain("LIVE PHONE CALL:");
    expect(opening).toContain("TIME CONTEXT:");
    expect(opening).toContain("BUSINESS HOURS (America/Chicago):");
    expect(opening.length).toBeGreaterThanOrEqual(1_500);
    // The most binding limits are kept and the last list gives way, by whole lines.
    expect(prompt).toContain(
      "COMPLIANCE: HIPAA\nTreat all caller-provided health information as PHI:",
    );
    expect(prompt).toContain("- topic 23 ");
    expect(prompt).toContain("- trigger 0 ");
    expect(prompt).not.toContain("- check 9 ");
    const block = prompt.slice(
      prompt.indexOf(HEADING),
      prompt.indexOf("## ACTION AND RESULT SAFETY"),
    );
    for (const line of block.trimEnd().split("\n").slice(2)) {
      expect(line, line).toMatch(/^(- .{20,}|[A-Z].*[.:]|COMPLIANCE: [A-Z].*)$/);
    }
    expect(block.trimEnd().endsWith(":")).toBe(false);
    expect(prompt).toContain("## ACTION AND RESULT SAFETY");
    expect(prompt).toContain("## VOICE AND DELIVERY CONSISTENCY");
    // The same with a calendar: its fixed rules stay too.
    const booked = longPrompt(everything, calendar);
    expect(booked.length).toBeLessThanOrEqual(18_000);
    const bookedOpening = booked.slice(0, booked.indexOf("[Context trimmed"));
    expect(bookedOpening).toContain("NATIVE CALENDAR TIME CONTEXT:");
    expect(bookedOpening).toContain("use only the returned slots");
    expect(bookedOpening).toContain("requested time was sent to the business to confirm");
    expect(booked).toContain(
      "COMPLIANCE: HIPAA\nTreat all caller-provided health information as PHI:",
    );
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
    expect(compose({ complianceMode: "standard" })).not.toContain("COMPLIANCE:");
  });
});

describe("the facts a call opens with", () => {
  const facts = (items: string[]) =>
    composeOpenAIRealtimeInstructions({
      agent,
      tenant,
      personality: "",
      directives: [],
      knowledge: items.map((content) => ({ content })),
      surface: "phone",
    });

  it("prints up to twenty-four, within its share of the prompt", () => {
    const thirty = Array.from({ length: 30 }, (_, index) => `Fact number ${index}.`);
    const prompt = facts(thirty);
    expect(prompt).toContain("- Fact number 23.");
    expect(prompt).not.toContain("- Fact number 24.");
  });

  it("passes over a fact too long for the room left and keeps the shorter ones after it", () => {
    const long = (label: string) => `${label} ${"long ".repeat(130)}end.`;
    const prompt = facts([
      long("First"),
      long("Second"),
      long("Third"),
      long("Fourth"),
      long("Fifth"),
      "Parking is free behind the building.",
    ]);
    const block = prompt.slice(
      prompt.indexOf("INITIAL APPROVED KNOWLEDGE:"),
      prompt.indexOf("## ACTION AND RESULT SAFETY"),
    );
    expect(block.length).toBeLessThan(3_400);
    // No fact is printed in part.
    for (const line of block.split("\n").filter((entry) => entry.startsWith("- "))) {
      expect(line.endsWith("end.") || line.endsWith("building.")).toBe(true);
    }
    expect(block).not.toContain("- Fifth ");
    expect(block).toContain("- Parking is free behind the building.");
  });
});

/**
 * A Bot whose owner set a compliance mode was told the mode's name and
 * nothing else: "Compliance mode: hipaa." The conduct rules for each mode
 * existed, with tests, in a prompt builder no call used.
 */
describe("a compliance mode", () => {
  it("gives the Bot the rules for that mode, kept with the fixed safety text", () => {
    const prompt = compose({ complianceMode: "hipaa" });
    const block = prompt.slice(
      prompt.indexOf("## LIMITS SET BY THE ACCOUNT HOLDER"),
      prompt.indexOf("## ACTION AND RESULT SAFETY"),
    );
    expect(block).toContain(
      [
        "COMPLIANCE: HIPAA",
        "Treat all caller-provided health information as PHI:",
        "- Verify identity (full name + date of birth + one secondary identifier) before discussing any account or health detail.",
        "- Never repeat or summarize PHI to anyone other than the verified caller or a documented authorized representative.",
        "- If a caller asks for medical advice, decline and offer to schedule a clinician consult.",
      ].join("\n"),
    );
    expect(prompt).not.toContain("Compliance mode: hipaa.");
    // The rules are lines of the kept block, not a heading of their own that
    // the cut could take for the start of what it keeps.
    expect(prompt).not.toContain("\n## COMPLIANCE");
  });

  it.each([
    ["pci", "Do not record, repeat, or write down card numbers, expiry dates, or CVVs."],
    ["gdpr", 'Honor opt-out, deletion, and "speak to a human" requests immediately.'],
    ["financial", "Do not provide tax, investment, or specific financial advice."],
    ["legal", "Do not provide legal advice. You may share general public information only."],
    ["tcpa", "clearly disclose that this is an automated AI assistant"],
  ])("carries the %s rules", (complianceMode, rule) => {
    expect(compose({ complianceMode })).toContain(rule);
  });

  it("says nothing for the stored default, and names a mode it has no rules for", () => {
    for (const complianceMode of ["standard", "none", "", null]) {
      const prompt = compose({ complianceMode });
      expect(prompt).not.toContain("COMPLIANCE:");
      expect(prompt).not.toContain("Compliance mode");
    }
    expect(compose({ complianceMode: "sox" })).toContain("Compliance mode: sox.");
  });
});

describe("a Bot held for review", () => {
  it("is given none of the owner's content, old or new", () => {
    const held = composeOpenAIRealtimeInstructions({
      agent: {
        ...agent,
        complianceMode: "hipaa",
        disallowedTopics: ["competitor pricing"],
        escalationKeywords: ["lawsuit"],
        playbook: { neverSay: ["guarantee"], alwaysMention: ["Free estimates"] },
      } as never,
      tenant,
      personality: "This collections role is review-required. Collect the balance today.",
      directives: [{ content: "Always confirm the callback number." }],
      knowledge: [{ content: "We are at 12 Main St." }],
      surface: "phone",
    });
    expect(held).toContain("review-required hold mode");
    for (const absent of [
      "BUSINESS HOURS",
      "TIME CONTEXT",
      "## LIMITS SET BY THE ACCOUNT HOLDER",
      "PLAYBOOK",
      "OPERATING RULES",
      "INITIAL APPROVED KNOWLEDGE",
      "competitor pricing",
      "12 Main St",
      "Delivery tone",
    ]) {
      expect(held, absent).not.toContain(absent);
    }
    expect(held).toContain("## ACTION AND RESULT SAFETY");
  });
});
