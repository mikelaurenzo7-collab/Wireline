import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  rules: [] as string[],
  firstMessage: "Original greeting",
  personality: "Protect private information.",
  owns: true,
  lockTail: Promise.resolve(),
  executeAction: vi.fn(),
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
              where: (statement: Parameters<typeof dialect.sqlToQuery>[0]) => ({
                limit: async () => {
                  const query = dialect.sqlToQuery(statement);
                  expect(query.params).toContain("tenant");
                  return getTableName(table).includes("personality")
                    ? [{ content: h.personality }]
                    : h.rules.includes(String(query.params.at(-1)))
                      ? [{ id: 1n }]
                      : [];
                },
              }),
            }),
          }),
          update: () => ({
            set: (value: { firstMessage?: string }) => ({
              where: async () => {
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
              h.rules.push(value.content);
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

async function apply(field: string, value: string) {
  const json = vi.fn();
  await h.routes.get("post /api/agents/:id/workspace/apply-change")!(
    {
      user: { id: "tenant" },
      params: { id: "bot" },
      body: { field, value },
    },
    { json },
  );
  return json.mock.calls[0]?.[0];
}

beforeEach(() => {
  h.rules = ["Keep the caller's information private.", "Opening greeting: Old Studio greeting"];
  h.firstMessage = "Original greeting";
  h.personality = "Protect private information.";
  h.owns = true;
  h.lockTail = Promise.resolve();
  h.executeAction.mockReset();
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

  it("removes a stale Studio override when approving a new Build greeting", async () => {
    expect(await apply("first_message", "Welcome to Acme.")).toMatchObject({
      success: true,
      value: "Welcome to Acme.",
    });
    expect(h.firstMessage).toBe("Welcome to Acme.");
    expect(h.rules).toEqual(["Keep the caller's information private."]);
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
