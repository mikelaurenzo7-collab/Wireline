import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  handler: null as Handler | null,
  personality: "Clear and helpful.",
  agent: {} as Record<string, unknown>,
  runStructuredStream: vi.fn(),
  write: vi.fn(),
  end: vi.fn(),
}));
vi.mock("express", () => ({
  Router: () => ({
    post: (_path: string, ...handlers: Handler[]) => {
      h.handler = handlers.at(-1)!;
    },
  }),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateEventStream: vi.fn() }));
vi.mock("../src/middleware/api-rate-limits", () => ({ claudeRateLimiter: vi.fn() }));
vi.mock("../src/lib/spend-guards", () => ({ enforcePrivateTextSimulationSpendCap: vi.fn() }));
vi.mock("../src/middleware/audit-middleware", () => ({ withAudit: () => vi.fn() }));
vi.mock("../src/lib/ai-client", () => ({ isRuntimeAvailable: () => true }));
vi.mock("../src/lib/ai-structured", () => ({ runStructuredStream: h.runStructuredStream }));
vi.mock("../src/lib/sse-stream", () => ({
  createSseStream: () => ({ write: h.write, end: h.end }),
  writeSseBootstrap: vi.fn(),
}));
vi.mock("../src/lib/server-context", async () => {
  const { getTableName } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  const tx = {
    select: (selection: Record<string, unknown>) => ({
      from: (table: Parameters<typeof getTableName>[0]) => ({
        where: (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
          const query = dialect.sqlToQuery(statement);
          expect(query.params).toContain("tenant");
          expect(query.params).toContain("bot");
          const name = getTableName(table);
          const rows = name.endsWith("agents")
            ? [Object.fromEntries(Object.keys(selection).map((key) => [key, h.agent[key]]))]
            : name.endsWith("personality")
              ? [{ content: h.personality }]
              : [];
          const chain = { limit: async () => rows };
          return { ...chain, orderBy: () => chain };
        },
      }),
    }),
  };
  return {
    log: { error: vi.fn() },
    serialQueryBatch: (queries: Promise<unknown>[]) => Promise.all(queries),
    drizzle: { transaction: (operation: (tx: unknown) => Promise<unknown>) => operation(tx) },
  };
});

import "../src/routes/agent-test-routes";
import { RUNTIME_REVIEW_REQUIRED_RESPONSE } from "../src/lib/runtime-template-personality";

async function rehearse() {
  await h.handler!(
    {
      user: { id: "tenant" },
      params: { id: "bot" },
      body: { content: "Can you help with my appointment?", history: [] },
    },
    { headersSent: false, status: vi.fn(() => ({ json: vi.fn() })) },
  );
}

beforeEach(() => {
  h.agent = {
    id: "bot",
    name: "Jordan",
    role: "customer_service",
    firstMessage: "Welcome to the front desk.",
    complianceMode: "pci",
    disallowedTopics: ["payment card details", "legal advice"],
    escalationKeywords: ["formal complaint", "urgent assistance"],
  };
  h.personality = "Clear and helpful.";
  h.runStructuredStream.mockReset().mockResolvedValue({ result: { reply: "How can I help?" } });
  h.write.mockClear();
  h.end.mockClear();
});

describe("private text rehearsal saved guardrails", () => {
  it("loads the owned Bot's saved guardrails into the actual model prompt", async () => {
    await rehearse();
    expect(h.runStructuredStream).toHaveBeenCalledOnce();
    const prompt = h.runStructuredStream.mock.calls[0][0].system;
    expect(prompt).toContain("Compliance mode: pci.");
    expect(prompt).toContain("Do not discuss: payment card details, legal advice.");
    expect(prompt).toContain(
      "Escalate or take a message when the caller raises: formal complaint, urgent assistance.",
    );
    expect(prompt).toContain("Preferred opening: Welcome to the front desk.");
    expect(prompt).toContain(
      "Do not claim a booking, transfer, message, payment, or other external action completed",
    );
    expect(h.write).toHaveBeenCalledWith(
      "done",
      expect.objectContaining({ changes: [], toolToggles: [], actions: [] }),
    );
  });

  it("does not invent restrictions when the saved settings are empty", async () => {
    Object.assign(h.agent, {
      complianceMode: "none",
      disallowedTopics: [],
      escalationKeywords: null,
    });
    await rehearse();
    const prompt = h.runStructuredStream.mock.calls[0][0].system;
    expect(prompt).not.toContain("Compliance mode:");
    expect(prompt).not.toContain("Do not discuss:");
    expect(prompt).not.toContain("Escalate or take a message when the caller raises:");
  });

  it("keeps review-required Bots out of the model even when saved guardrails exist", async () => {
    h.personality =
      "Helpful.\n## TEMPLATE SPECIALTY: Medical Office Scheduling\nArrange appointments.";
    await rehearse();
    expect(h.runStructuredStream).not.toHaveBeenCalled();
    expect(h.write).toHaveBeenCalledWith(
      "done",
      expect.objectContaining({ reply: RUNTIME_REVIEW_REQUIRED_RESPONSE, actions: [] }),
    );
  });
});
