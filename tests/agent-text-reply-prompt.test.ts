import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * What an owner sets has to reach a text reply as it reaches a call. An audit
 * found the text Bot was given the tone cut off before the owner's choice,
 * the opening hours as raw JSON, and a "workspace profile" that held only
 * internal flags and voice settings.
 */
const h = vi.hoisted(() => ({
  rows: [] as unknown[][],
  structured: vi.fn(),
  knowledge: vi.fn(),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    transaction: async (work: (tx: unknown) => unknown) => {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "from", "where", "orderBy", "limit"]) {
        chain[method] = () => chain;
      }
      return work(chain);
    },
  },
  serialQueryBatch: async () => h.rows,
}));
vi.mock("../src/lib/ai-structured", () => ({ runStructured: h.structured }));
vi.mock("../src/lib/agent-knowledge-search", () => ({
  DIRECTIVE_PROMPT_ORDER: [],
  loadPromptKnowledge: h.knowledge,
}));

import { generateAgentTextReply } from "../src/lib/agent-text-reply";
import { composeSetupPersonality } from "../src/lib/compose-setup-personality";
import { privateTestConversationText } from "../src/lib/private-agent-test";

const weekday = { open: "08:00", close: "17:00" };
const agent = {
  id: "bot-1",
  name: "Sam",
  role: "receptionist",
  firstMessage: null,
  businessHours: {
    mon: weekday,
    tue: weekday,
    wed: weekday,
    thu: weekday,
    fri: weekday,
    sat: { closed: true },
    sun: { closed: true },
  },
  timezone: "America/Chicago",
  outOfHoursMessage: null,
  complianceMode: "standard",
  disallowedTopics: null,
  escalationKeywords: null,
  escalationPhone: null,
  escalationEmail: null,
  playbook: null,
};
const scope = { userId: "tenant-1", agentId: "bot-1" };
const ask = (body: string) => ({ direction: "in" as const, body });

async function systemFor(
  personality: string,
  messages = [ask("Are you open now?")],
  overrides: Record<string, unknown> = {},
) {
  h.rows = [[{ ...agent, ...overrides }], personality ? [{ content: personality }] : [], []];
  await generateAgentTextReply({ ...scope, messages });
  return String(h.structured.mock.calls.at(-1)?.[0].system);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  // Friday 27 November 2026, 3:42 in the afternoon in Chicago.
  vi.setSystemTime(new Date("2026-11-27T21:42:00Z"));
  h.knowledge.mockResolvedValue([]);
  h.structured.mockResolvedValue({ reply: "Yes, until 5.", requires_human: false, reason: "" });
});
afterEach(() => vi.useRealTimers());

describe("what an owner set, in a text reply", () => {
  it("leads with the tone the owner chose, however long the saved role text is", async () => {
    const role = `You are an elite receptionist. ${"Handle it completely. ".repeat(90)}`.trim();
    const saved = composeSetupPersonality(role, "Concise");
    expect(saved.indexOf("## DELIVERY TONE")).toBeGreaterThan(1_500);
    expect(await systemFor(saved)).toContain(
      "Tone: Delivery tone: Concise. Concise, useful, and discreet.",
    );
    // A Bot nobody set a tone for keeps the default.
    expect(await systemFor("")).toContain("Tone: clear, warm, and professional.");
  });

  it("gives the hours in plain words and says whether the business is open now", async () => {
    const system = await systemFor("");
    expect(system).toContain(
      "BUSINESS HOURS (America/Chicago): Monday to Friday 8 AM to 5 PM. Saturday to Sunday closed.",
    );
    expect(system).toContain("It is Friday 3:42 PM there, and the business is open right now.");
    // Not the saved JSON, and not the internal settings that sat beside it.
    expect(system).not.toContain('"mon"');
    expect(system).not.toContain("Operating hours:");
    expect(system).not.toContain("Workspace profile");
    // The stored default says nothing a Bot can act on.
    expect(system).not.toContain("Compliance mode: standard.");
    expect(await systemFor("", undefined, { complianceMode: "hipaa" })).toContain(
      "Compliance mode: hipaa.",
    );

    vi.setSystemTime(new Date("2026-11-28T16:00:00Z"));
    expect(await systemFor("")).toContain(
      "It is Saturday 10:00 AM there, and the business is closed right now.",
    );
    expect(await systemFor("", undefined, { businessHours: null })).not.toContain("BUSINESS HOURS");
  });

  it("looks up knowledge for the newest message first", async () => {
    await systemFor("", [
      ask("Where can I park?"),
      { direction: "out", body: "Behind the building." },
      ask("How much is a tankless install?"),
    ]);
    expect(h.knowledge.mock.calls[0][1].text).toBe(
      "How much is a tankless install?\nWhere can I park?",
    );
    // The typed rehearsal searches the same way.
    expect(
      privateTestConversationText("How much is a tankless install?", [
        { role: "customer", content: "Where can I park?" },
        { role: "agent", content: "Behind the building." },
        { role: "customer", content: "Do you open Saturdays?" },
      ] as never),
    ).toBe("How much is a tankless install?\nDo you open Saturdays?\nWhere can I park?");
  });
});
