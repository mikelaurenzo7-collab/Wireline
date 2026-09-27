import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  directives: [] as string[],
  firstMessage: null as string | null,
  lockTail: Promise.resolve(),
}));
vi.mock("express", () => ({
  Router: () =>
    Object.fromEntries(
      ["get", "post", "patch", "delete"].map((method) => [
        method,
        (path: string, ...handlers: Handler[]) =>
          h.routes.set(`${method} ${path}`, handlers.at(-1)!),
      ]),
    ),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: () => {} }));
vi.mock("../src/middleware/api-rate-limits", () => ({ agentMutationRateLimit: () => {} }));
vi.mock("../src/lib/ai-audit", () => ({ recordUsage: vi.fn() }));
vi.mock("../src/lib/agents-store", () => ({ listAgentsForUser: vi.fn() }));
vi.mock("../src/lib/auth-service", () => ({ isOwnerEmail: vi.fn() }));
vi.mock("../src/lib/agent-entitlements", () => ({
  agentCapMessage: vi.fn(),
  resolveAgentEntitlement: vi.fn(),
}));
vi.mock("../src/lib/ai-structured", () => ({ runStructured: vi.fn() }));
vi.mock("../src/lib/ai-client", () => ({ resolveResponsesEvidence: vi.fn() }));
vi.mock("../src/lib/product-event-server", () => ({ emitServerProductEventOnce: vi.fn() }));
vi.mock("../src/lib/paid-bot-identity", () => ({ PAID_BOT_IDENTITY_JOB_TYPE: "unused" }));
vi.mock("../src/lib/server-context", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  return {
    log: { warn: vi.fn(), error: vi.fn() },
    drizzle: {
      select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ id: "bot" }] }) }) }),
      transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
        let unlock: (() => void) | undefined;
        const tx = {
          execute: async (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
            const query = dialect.sqlToQuery(statement);
            expect(query.sql).toMatch(/FOR UPDATE/i);
            expect(query.params).toEqual(["bot", "tenant"]);
            const prior = h.lockTail;
            h.lockTail = new Promise((resolve) => {
              unlock = resolve;
            });
            await prior;
          },
          delete: () => ({
            where: async () => {
              h.directives = h.directives.filter(
                (content) => !content.startsWith("Opening greeting:"),
              );
              // A database round trip lets the second save run before the first
              // insert unless the real handler holds the parent Bot row lock.
              await new Promise((resolve) => setImmediate(resolve));
            },
          }),
          update: () => ({
            set: ({ firstMessage }: { firstMessage: string | null }) => ({
              where: async () => {
                h.firstMessage = firstMessage;
              },
            }),
          }),
          insert: () => ({
            values: async ({ content }: { content: string }) => {
              h.directives.push(content);
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

import "../src/routes/agent-routes-v2";

function save(content: string) {
  return h.routes.get("post /api/agent-config/:id/manual")!(
    {
      user: { id: "tenant" },
      params: { id: "bot" },
      body: { type: "directive", replacePrefix: "Opening greeting:", content },
    },
    { json: vi.fn() },
  );
}

beforeEach(() => {
  h.directives = ["Keep customer data private."];
  h.lockTail = Promise.resolve();
  h.firstMessage = "Original greeting";
});

describe("greeting replacement concurrency", () => {
  it("keeps only the latest greeting when two sessions save together", async () => {
    await Promise.all([save("Opening greeting: Hello."), save("Opening greeting: Welcome.")]);
    expect(h.directives).toEqual(["Keep customer data private.", "Opening greeting: Welcome."]);
    expect(h.firstMessage).toBe("Welcome.");
  });
  it("can clear a greeting while another session is saving it", async () => {
    await Promise.all([save("Opening greeting: Hello."), save("")]);
    expect(h.directives).toEqual(["Keep customer data private."]);
    expect(h.firstMessage).toBeNull();
  });
});
