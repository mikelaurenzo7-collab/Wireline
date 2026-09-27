import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  tools: [] as string[],
  lockTail: Promise.resolve(),
  owned: true,
  writes: 0,
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
vi.mock("../src/lib/action-engine", () => ({ executeAction: vi.fn() }));
vi.mock("../src/lib/agent-ownership", () => ({
  findOwnedAgentProfile: async () => {
    const row = h.owned ? { role: "customer_service", enabledTools: [...h.tools] } : null;
    // Both pre-lock reads observe the old selection during concurrent requests.
    await new Promise((resolve) => setImmediate(resolve));
    return row;
  },
}));
vi.mock("../src/lib/server-context", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  const update = () => ({
    set: ({ enabledTools }: { enabledTools: string[] }) => ({
      where: async () => {
        h.tools = [...enabledTools];
        h.writes++;
      },
    }),
  });
  return {
    log: { info: vi.fn(), error: vi.fn() },
    serialQueryBatch: vi.fn(),
    drizzle: {
      update,
      transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
        let unlock: (() => void) | undefined;
        const tx = {
          select: () => ({
            from: () => ({
              where: (statement: Parameters<typeof dialect.sqlToQuery>[0]) => ({
                limit: () => ({
                  for: async (mode: string) => {
                    expect(mode).toBe("update");
                    expect(dialect.sqlToQuery(statement).params).toEqual(["bot", "tenant"]);
                    const prior = h.lockTail;
                    h.lockTail = new Promise((resolve) => {
                      unlock = resolve;
                    });
                    await prior;
                    return h.owned
                      ? [{ role: "customer_service", enabledTools: [...h.tools] }]
                      : [];
                  },
                }),
              }),
            }),
          }),
          update,
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

function toggle(tool: string, enable: boolean) {
  return h.routes.get("post /api/agents/:id/workspace/toggle-tool")!(
    { user: { id: "tenant" }, params: { id: "bot" }, body: { tool, enable } },
    { json: vi.fn() },
  );
}

beforeEach(() => {
  h.tools = [];
  h.lockTail = Promise.resolve();
  h.owned = true;
  h.writes = 0;
});

describe("reviewed tool proposal concurrency", () => {
  it("preserves both distinct capabilities when two proposals are enabled together", async () => {
    await Promise.all([toggle("send_email", true), toggle("book_appointment", true)]);
    expect(h.tools).toEqual(expect.arrayContaining(["send_email", "book_appointment"]));
    expect(h.tools).toHaveLength(2);
  });

  it("does not resurrect a disabled capability while another is being enabled", async () => {
    h.tools = ["send_email"];
    await Promise.all([toggle("send_email", false), toggle("book_appointment", true)]);
    expect(h.tools).toEqual(["book_appointment"]);
  });

  it("rejects a missing or foreign Bot inside the mutation transaction", async () => {
    h.owned = false;
    await expect(toggle("send_email", true)).rejects.toMatchObject({ status: 404 });
    expect(h.writes).toBe(0);
  });
});
