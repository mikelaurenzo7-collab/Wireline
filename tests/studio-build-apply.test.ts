import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  rules: [] as string[],
  facts: [] as string[],
  memories: [] as Array<{ user: string; agent: string; content: string }>,
  firstMessage: "Original greeting",
  personality: "Protect private information.",
  owns: true,
  lockTail: Promise.resolve(),
  executeAction: vi.fn(),
  lastAgentUpdate: null as Record<string, unknown> | null,
  metadata: null as Record<string, unknown> | null,
  messageOwner: "tenant" as string,
  handoff: {} as Record<string, unknown>,
  phones: [] as string[],
}));
vi.mock("express", () => ({
  default: {
    Router: () =>
      Object.fromEntries(
        ["get", "post", "patch", "delete"].map((method) => [
          method,
          (path: string, ...handlers: Handler[]) =>
            h.routes.set(`${method} ${path}`, handlers.at(-1)!),
        ]),
      ),
  },
}));
vi.mock("../src/middleware/auth", () => ({
  authenticateUser: vi.fn(),
  authenticateEventStream: vi.fn(),
}));
vi.mock("../src/middleware/api-rate-limits", () => ({
  claudeRateLimiter: vi.fn(),
  smsRateLimit: vi.fn(),
}));
vi.mock("../src/lib/ai-structured", () => ({
  runStructuredStream: vi.fn(),
  runStructuredWithThinking: vi.fn(),
}));
vi.mock("../src/lib/ai-client", () => ({ isRuntimeAvailable: () => true }));
vi.mock("../src/middleware/audit-middleware", () => ({ withAudit: () => vi.fn() }));
vi.mock("../src/lib/spend-guards", () => ({
  enforceSpendCap: vi.fn(),
  enforcePrivateTextSimulationSpendCap: vi.fn(),
}));
vi.mock("../src/lib/agent-ownership", () => ({
  findOwnedAgentProfile: vi.fn(async (_agent, user) => {
    expect(user).toBe("tenant");
    return h.owns ? { id: "bot", role: "customer_service", enabledTools: [] } : null;
  }),
}));
vi.mock("../src/lib/action-engine", () => ({ executeAction: h.executeAction }));
vi.mock("../src/lib/owner-memory-store", () => ({
  loadOwnerMemories: vi.fn(async () => []),
  changeOwnerMemory: vi.fn(),
  addOwnerMemoryInTransaction: vi.fn(
    async (tx: unknown, user: string, agent: string, content: string) => {
      expect(tx).toBeTruthy();
      h.memories.push({ user, agent, content });
    },
  ),
}));
vi.mock("../src/lib/server-context", async () => {
  const { getTableName } = await import("drizzle-orm");
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  return {
    log: { info: vi.fn(), error: vi.fn() },
    serialQueryBatch: vi.fn(),
    drizzle: {
      transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
        let unlock: (() => void) | undefined;
        const tx = {
          execute: async (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
            const query = dialect.sqlToQuery(statement);
            expect(query.sql).toMatch(/FOR UPDATE/);
            expect(query.params).toEqual(["bot", "tenant"]);
            const prior = h.lockTail;
            h.lockTail = new Promise((resolve) => {
              unlock = resolve;
            });
            await prior;
          },
          select: () => ({
            from: (table: Parameters<typeof getTableName>[0]) => ({
              where: (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
                const query = dialect.sqlToQuery(statement);
                expect(query.params).toContain("tenant");
                const name = getTableName(table);
                const rows = name.includes("conversation_messages")
                  ? h.messageOwner === "tenant" && query.params.includes(42n)
                    ? [{ role: "agent", metadata: h.metadata }]
                    : []
                  : name.includes("personality")
                    ? [{ content: h.personality }]
                    : name === "wireline_agents"
                      ? [
                          {
                            phone: h.handoff.escalationPhone,
                            legacyPhone: h.handoff.transferPhone,
                            email: h.handoff.escalationEmail,
                            transfer: h.handoff.escalationHandoffEnabled,
                          },
                        ]
                      : name === "wireline_phone_numbers"
                        ? h.phones.map((phone) => ({ phone }))
                        : name === "wireline_knowledge"
                          ? h.facts.includes(String(query.params.at(-1)))
                            ? [{ id: 1n }]
                            : []
                          : h.rules.includes(String(query.params.at(-1)))
                            ? [{ id: 1n }]
                            : [];
                const result = () =>
                  Object.assign(Promise.resolve(rows), {
                    for: async (mode: string) => {
                      expect(mode).toBe("update");
                      return rows;
                    },
                  });
                return Object.assign(Promise.resolve(rows), { limit: result });
              },
            }),
          }),
          update: (table: Parameters<typeof getTableName>[0]) => ({
            set: (value: { firstMessage?: string; metadata?: Record<string, unknown> }) => ({
              where: async (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
                if (getTableName(table).includes("conversation_messages")) {
                  expect(dialect.sqlToQuery(statement).params).toEqual([42n, "tenant", "bot"]);
                  h.metadata = value.metadata || null;
                  return;
                }
                h.lastAgentUpdate = value;
                Object.assign(h.handoff, value);
                if (value.firstMessage) h.firstMessage = value.firstMessage;
              },
            }),
          }),
          delete: () => ({
            where: async () => {
              h.rules = h.rules.filter((rule) => !rule.startsWith("Opening greeting:"));
            },
          }),
          insert: (table: Parameters<typeof getTableName>[0]) => ({
            values: (value: { content: string; userId: string }) => {
              expect(value.userId).toBe("tenant");
              if (getTableName(table).includes("personality"))
                return {
                  onConflictDoUpdate: async () => {
                    h.personality = value.content;
                  },
                };
              if (getTableName(table) === "wireline_knowledge") h.facts.push(value.content);
              else h.rules.push(value.content);
              return Promise.resolve();
            },
          }),
        };
        try {
          return await operation(tx);
        } finally {
          unlock?.();
        }
      },
    },
  };
});
import "../src/routes/agent-workspace-routes";

async function applyBody(body: Record<string, unknown>) {
  const json = vi.fn();
  await h.routes.get("post /api/agents/:id/workspace/apply-change")!(
    { user: { id: "tenant" }, params: { id: "bot" }, body },
    { json },
  );
  return json.mock.calls[0]?.[0];
}

async function apply(field: string, value: string) {
  h.metadata = {
    proposals: {
      changes: [{ field, label: "Review", value, summary: "Review change" }],
      toolToggles: [],
      actions: [],
    },
    savedProposalKeys: [],
  };
  return applyBody({ field, value, proposalMessageId: "42", proposalKey: "change-0" });
}

beforeEach(() => {
  h.rules = ["Keep the caller's information private.", "Opening greeting: Old Studio greeting"];
  h.facts = ["We serve Austin and Round Rock."];
  h.memories = [];
  h.firstMessage = "Original greeting";
  h.personality = "Protect private information.";
  h.owns = true;
  h.lockTail = Promise.resolve();
  h.executeAction.mockReset();
  h.lastAgentUpdate = null;
  h.metadata = null;
  h.messageOwner = "tenant";
  h.handoff = {
    escalationPhone: "+13125550120",
    transferPhone: "+13125550121",
    escalationEmail: "owner@example.test",
    escalationHandoffEnabled: false,
  };
  h.phones = ["+15125550124"];
});

describe("explicit Studio proposal application", () => {
  it("appends a reviewed rule once across concurrent retries without replacing other rules", async () => {
    await Promise.all([
      apply("operating_rule", "Confirm callback numbers."),
      apply("operating_rule", "Confirm callback numbers."),
    ]);
    expect(h.rules).toEqual([
      "Keep the caller's information private.",
      "Opening greeting: Old Studio greeting",
      "Confirm callback numbers.",
    ]);
  });

  it("saves a fact the owner told the chat to Knowledge once, not as a rule", async () => {
    await Promise.all([
      apply("business_fact", "Service calls are $89."),
      apply("business_fact", "Service calls are $89."),
    ]);
    expect(h.facts).toEqual(["We serve Austin and Round Rock.", "Service calls are $89."]);
    expect(h.rules).not.toContain("Service calls are $89.");
    expect(await apply("business_fact", "We serve Austin and Round Rock.")).toMatchObject({
      success: true,
      field: "business_fact",
    });
    expect(h.facts).toEqual(["We serve Austin and Round Rock.", "Service calls are $89."]);
  });

  it("keeps a note about the owner private, in the Bot's locked transaction", async () => {
    expect(await apply("owner_memory", "I like short updates.")).toMatchObject({
      success: true,
      field: "owner_memory",
    });
    expect(h.memories).toEqual([
      { user: "tenant", agent: "bot", content: "I like short updates." },
    ]);
    expect(h.facts).not.toContain("I like short updates.");
    expect(h.rules).not.toContain("I like short updates.");
  });

  it("removes a stale Studio override when approving a new Build greeting", async () => {
    expect(await apply("first_message", "Welcome to Acme.")).toMatchObject({
      success: true,
      value: "Welcome to Acme.",
    });
    expect(h.firstMessage).toBe("Welcome to Acme.");
    expect(h.rules).toEqual(["Keep the caller's information private."]);
  });

  it("turns on live transfer only when the owner approves a transfer number", async () => {
    const receipt = await apply("transfer_phone", "+1 (512) 555-0100");
    expect(receipt).toMatchObject({
      success: true,
      value: "+15125550100",
    });
    expect(h.lastAgentUpdate).toEqual({
      escalationPhone: "+15125550100",
      transferPhone: null,
      escalationHandoffEnabled: true,
    });
    expect(h.handoff.escalationPhone || h.handoff.transferPhone).toBe("+15125550100");
    await apply("escalation_phone", "+1 (512) 555-0101");
    expect(h.lastAgentUpdate).toEqual({ escalationPhone: "+15125550101", transferPhone: null });
    expect(h.handoff.escalationPhone || h.handoff.transferPhone).toBe("+15125550101");
    expect(h.handoff.escalationHandoffEnabled).toBe(true);
  });

  it.each([
    ["transfer_phone", "(512) 555-0124"],
    ["escalation_phone", "+15125550124"],
    ["transfer_phone", "1234567"],
    ["escalation_phone", "+13125550123 +13125550124"],
    ["transfer_phone", "+13125550123 ext 8"],
  ])("rejects an invalid or looping reviewed %s before saving", async (field, value) => {
    await expect(apply(field, value)).rejects.toMatchObject({ status: 400 });
    expect(h.lastAgentUpdate).toBeNull();
    expect(h.metadata?.savedProposalKeys).toEqual([]);
  });

  it("a notification destination does not silently turn on live transfers", async () => {
    await apply("escalation_phone", "(312) 555-0123");
    expect(h.handoff).toMatchObject({
      escalationPhone: "+13125550123",
      transferPhone: null,
      escalationHandoffEnabled: false,
      escalationEmail: "owner@example.test",
    });
  });

  it("updates the effective delivery tone without erasing saved instructions", async () => {
    await apply("personality_vibe", "warm");
    expect(h.personality).toBe(
      "Protect private information.\n\n## DELIVERY TONE\nwarm. Concise, useful, and discreet.",
    );
  });

  it("refuses a Bot owned by another tenant before any write", async () => {
    h.owns = false;
    await expect(apply("operating_rule", "Injected rule")).rejects.toMatchObject({ status: 404 });
    expect(h.rules).not.toContain("Injected rule");
  });

  it("updates tone while preserving a regulated marker after the tone stanza", async () => {
    h.personality =
      "Saved role\n\n## DELIVERY TONE\nClear.\n\n## TEMPLATE SPECIALTY: Medical Office Scheduling\nRequires review.";
    expect(await apply("personality_vibe", "warm")).toMatchObject({ success: true });
    expect(h.personality).toContain("## DELIVERY TONE\nwarm. Concise, useful, and discreet.");
    expect(h.personality).toContain(
      "## TEMPLATE SPECIALTY: Medical Office Scheduling\nRequires review.",
    );
  });

  it("requires a matching, tenant-owned review card and keeps a repeated save idempotent", async () => {
    await expect(applyBody({ field: "first_message", value: "Unsafe" })).rejects.toMatchObject({
      status: 409,
    });
    await apply("first_message", "Welcome to Acme.");
    expect(h.metadata).toMatchObject({ savedProposalKeys: ["change-0"] });
    expect(
      await applyBody({
        field: "first_message",
        value: "Welcome to Acme.",
        proposalMessageId: "42",
        proposalKey: "change-0",
      }),
    ).toMatchObject({ success: true, savedProposalKey: "change-0" });
    expect(h.metadata).toMatchObject({ savedProposalKeys: ["change-0"] });

    await expect(
      applyBody({
        field: "first_message",
        value: "Tampered value",
        proposalMessageId: "42",
        proposalKey: "change-0",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(h.firstMessage).toBe("Welcome to Acme.");

    h.messageOwner = "another-tenant";
    await expect(
      applyBody({
        field: "first_message",
        value: "Welcome to Acme.",
        proposalMessageId: "42",
        proposalKey: "change-0",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("preserves queued-for-approval instead of implying an external send completed", async () => {
    h.executeAction.mockResolvedValue({ success: true, queued: true });
    const json = vi.fn();
    await h.routes.get("post /api/agents/:id/workspace/run-action")!(
      {
        user: { id: "tenant" },
        params: { id: "bot" },
        body: {
          kind: "send_text_message",
          to: "+13125550100",
          body: "Your requested information.",
        },
      },
      { json },
    );
    expect(json).toHaveBeenCalledWith({ success: true, kind: "send_text_message", queued: true });
  });
});
