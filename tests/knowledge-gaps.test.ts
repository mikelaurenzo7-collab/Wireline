import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Needs You has a Gaps tab that lists what callers asked and the Bot could
 * not answer, each with a link to add the answer. An audit found that nothing
 * had ever written to it: the Bot said "I'll take a message" and the owner
 * never learned what was missing.
 */
const h = vi.hoisted(() => ({ search: vi.fn(), open: vi.fn(), saved: vi.fn() }));
vi.mock("../src/lib/agent-knowledge-search", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  searchAgentKnowledge: h.search,
}));
vi.mock("../src/lib/action-engine", () => ({ executeAction: vi.fn() }));
vi.mock("../src/lib/ai-supervisor", () => ({ superviseClientCommunication: vi.fn() }));
vi.mock("../src/lib/integrations", () => ({ IntegrationService: class {} }));
vi.mock("../src/lib/server-context", () => ({
  auditLogger: {},
  drizzle: {},
  log: { warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../src/lib/account-environment-policy", () => ({
  liveExternalActionPolicyForUser: vi.fn(),
  externalEntityActionPolicyForUser: vi.fn(),
}));
vi.mock("../src/lib/twilio-service", () => ({
  lookupTenantPhoneNumber: vi.fn(),
  sendTenantMessage: vi.fn(),
}));
vi.mock("../src/lib/agent-runtime-helpers", () => ({
  PRESERVED_LEAD_STATUSES: [],
  sanitizePhone: (value: unknown) => (typeof value === "string" ? value : ""),
}));
vi.mock("../src/lib/agent-link-tool-handlers", () => ({
  handleSendPaymentLink: vi.fn(),
  handleSendSignupLink: vi.fn(),
}));
vi.mock("../src/lib/outbound-dial-gate", () => ({ evaluateOutboundDialGate: vi.fn() }));

import { handleCoreToolCall } from "../src/lib/bot-tools/core";
import {
  KNOWLEDGE_GAP_PREFIX,
  knowledgeGapLesson,
  recordKnowledgeGap,
} from "../src/lib/knowledge-gaps";

const db = {
  select: () => ({ from: () => ({ where: h.open }) }),
  insert: () => ({
    values: (row: unknown) => ({
      onConflictDoNothing: (target: unknown) => h.saved(row, target),
    }),
  }),
};
const scope = { userId: "tenant-1", agentId: "bot-1" };
const QUESTION = "Do you offer financing on a new furnace?";

beforeEach(() => {
  vi.resetAllMocks();
  h.open.mockResolvedValue([{ count: 0 }]);
  h.saved.mockResolvedValue(undefined);
  h.search.mockResolvedValue([]);
});

describe("saving what a Bot could not answer", () => {
  it("keeps one row per question, waiting, in the caller's words", async () => {
    expect(
      await recordKnowledgeGap(db as never, {
        ...scope,
        question: `  Do you offer   financing\non a new furnace?  `,
        callId: "call-1",
      }),
    ).toBe(true);
    expect(h.saved).toHaveBeenCalledOnce();
    const [row, conflict] = h.saved.mock.calls[0];
    expect(row).toEqual({
      userId: "tenant-1",
      agentId: "bot-1",
      lesson: `[KNOWLEDGE GAP] ${QUESTION}`,
      source: "knowledge_gap",
      sourceCallId: "call-1",
      // A caller's words are never something the Bot was taught.
      lessonStatus: "pending",
    });
    // The same question from the same Bot is kept once.
    expect(conflict.target).toHaveLength(2);
  });

  it("cuts a long question and refuses one too short to answer", () => {
    expect(knowledgeGapLesson("x".repeat(500))).toBe(`[KNOWLEDGE GAP] ${"x".repeat(200)}`);
    for (const short of ["", "   ", "hours", "ok?", null, undefined]) {
      expect(knowledgeGapLesson(short)).toBeNull();
    }
  });

  it("saves nothing without a Bot, an owner or a real question", async () => {
    expect(
      await recordKnowledgeGap(db as never, { ...scope, userId: "", question: QUESTION }),
    ).toBe(false);
    expect(
      await recordKnowledgeGap(db as never, { ...scope, agentId: "", question: QUESTION }),
    ).toBe(false);
    expect(await recordKnowledgeGap(db as never, { ...scope, question: "ok?" })).toBe(false);
    expect(h.open).not.toHaveBeenCalled();
    expect(h.saved).not.toHaveBeenCalled();
  });

  it("stops adding once a Bot has more open than an owner would read", async () => {
    h.open.mockResolvedValue([{ count: 60 }]);
    expect(await recordKnowledgeGap(db as never, { ...scope, question: QUESTION })).toBe(false);
    expect(h.saved).not.toHaveBeenCalled();
    h.open.mockResolvedValue([{ count: 59 }]);
    expect(await recordKnowledgeGap(db as never, { ...scope, question: QUESTION })).toBe(true);
  });

  it("never throws: a search must not fail because this could not be saved", async () => {
    h.open.mockRejectedValue(new Error("Database unavailable."));
    expect(await recordKnowledgeGap(db as never, { ...scope, question: QUESTION })).toBe(false);
    h.open.mockResolvedValue([{ count: 0 }]);
    h.saved.mockRejectedValue(new Error("Database unavailable."));
    expect(await recordKnowledgeGap(db as never, { ...scope, question: QUESTION })).toBe(false);
  });
});

describe("the knowledge search during a call", () => {
  const context = {
    toolCallId: "tool-search",
    payload: {},
    message: { call: { id: "call-1" } },
    agent: { id: "bot-1", user_id: "tenant-1" },
    webhookAgentId: "bot-1",
    drizzle: db,
    log: { warn: vi.fn(), error: vi.fn() },
  };
  const ask = (query: string) =>
    handleCoreToolCall("search_knowledge_base", { query }, context as never);

  it("saves the question when nothing the Bot was taught matches it", async () => {
    const result = await ask(QUESTION);
    expect(result?.result).toMatch(/^NO_VERIFIED_MATCH: No approved knowledge matched/);
    expect(h.saved).toHaveBeenCalledOnce();
    expect(h.saved.mock.calls[0][0]).toMatchObject({
      userId: "tenant-1",
      agentId: "bot-1",
      lesson: `[KNOWLEDGE GAP] ${QUESTION}`,
      sourceCallId: "call-1",
    });
  });

  it("saves nothing when the search found an answer", async () => {
    h.search.mockResolvedValue([
      { source: "knowledge", content: "Financing is available on new furnaces.", score: 4 },
    ]);
    const result = await ask(QUESTION);
    expect(result?.result).toMatch(/^VERIFIED_KNOWLEDGE_MATCH:/);
    expect(result?.result).toContain("[knowledge] Financing is available on new furnaces.");
    expect(h.saved).not.toHaveBeenCalled();
  });

  it("saves nothing for a question of common words only", async () => {
    const result = await ask("is it ok?");
    expect(result?.result).toMatch(/^NO_VERIFIED_MATCH: The question is too broad/);
    expect(h.saved).not.toHaveBeenCalled();
  });

  it("still answers the Bot when the question could not be saved", async () => {
    h.open.mockRejectedValue(new Error("Database unavailable."));
    const result = await ask(QUESTION);
    expect(result?.result).toMatch(/^NO_VERIFIED_MATCH: No approved knowledge matched/);
  });
});

describe("the Gaps tab", () => {
  it("strips the same prefix the server writes", () => {
    expect(readFileSync("src/components/ApprovalInbox.tsx", "utf8")).toContain(
      `const KNOWLEDGE_GAP_PREFIX = "${KNOWLEDGE_GAP_PREFIX}";`,
    );
  });
});

describe("clearing a question", () => {
  it("hides one the owner dismissed, and dismisses through the review route", () => {
    const reader = readFileSync("src/routes/fleet-routes.ts", "utf8");
    expect(reader).toContain('like(schema.agentLessons.lesson, "[KNOWLEDGE GAP]%"),');
    expect(reader).toContain(
      "sql`${schema.agentLessons.lessonStatus} IS DISTINCT FROM 'rejected'`,",
    );
    const inbox = readFileSync("src/components/ApprovalInbox.tsx", "utf8");
    expect(inbox).toContain('await authFetch("/api/agents/lessons/review", {');
    expect(inbox).toContain('body: JSON.stringify({ lesson_id: id, action: "reject" }),');
  });
});
