import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
type Rule = { id: bigint; agentId: string; userId: string; content: string; priority: number };
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  rules: [] as Rule[],
  update: vi.fn(),
  failure: null as Error | null,
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
vi.mock("../src/lib/agents-store", () => ({ listAgentsForUser: vi.fn() }));
vi.mock("../src/lib/auth-service", () => ({ isOwnerEmail: vi.fn() }));
vi.mock("../src/lib/agent-entitlements", () => ({
  agentCapMessage: vi.fn(),
  resolveAgentEntitlement: vi.fn(),
}));
vi.mock("../src/lib/product-event-server", () => ({ emitServerProductEventOnce: vi.fn() }));
vi.mock("../src/lib/paid-bot-identity", () => ({ PAID_BOT_IDENTITY_JOB_TYPE: "unused" }));
vi.mock("../src/lib/training-ai-spend", () => ({
  runTrainingStructured: vi.fn(),
  runTrainingImage: vi.fn(),
  isTrainingImageAvailable: () => false,
}));
vi.mock("../src/lib/server-context", async () => {
  const { PgDialect } = await import("drizzle-orm/pg-core");
  const dialect = new PgDialect();
  return {
    log: { warn: vi.fn(), error: vi.fn() },
    drizzle: {
      select: () => ({
        from: () => ({
          where: (where: Parameters<typeof dialect.sqlToQuery>[0]) => ({
            limit: async () => {
              const { params } = dialect.sqlToQuery(where);
              return params[0] === "bot-a" && params[1] === "tenant-a" ? [{ id: "bot-a" }] : [];
            },
          }),
        }),
      }),
      update: (...args: unknown[]) => {
        h.update(...args);
        return {
          set: ({ content }: { content: string }) => ({
            where: (where: Parameters<typeof dialect.sqlToQuery>[0]) => ({
              returning: async () => {
                const { sql, params } = dialect.sqlToQuery(where);
                expect(sql).toContain('"wireline_directives"."id" =');
                expect(sql).toContain('"wireline_directives"."agent_id" =');
                expect(sql).toContain('"wireline_directives"."user_id" =');
                expect(sql).toContain('left("wireline_directives"."content",');
                expect(params.slice(3)).toEqual(["Opening greeting:".length, "Opening greeting:"]);
                if (h.failure) throw h.failure;
                const row = h.rules.find(
                  (rule) =>
                    rule.id === params[0] &&
                    rule.agentId === params[1] &&
                    rule.userId === params[2] &&
                    !rule.content.startsWith("Opening greeting:"),
                );
                if (!row) return [];
                row.content = content;
                return [{ id: row.id, content, priority: row.priority }];
              },
            }),
          }),
        };
      },
    },
  };
});
import "../src/routes/agent-routes-v2";

function request(content: unknown, rowId = "31", userId = "tenant-a") {
  const json = vi.fn();
  const result = h.routes.get("patch /api/agent-config/:id/directive/:rowId")!(
    { user: { id: userId }, params: { id: "bot-a", rowId }, body: { content } },
    { json },
  );
  return { result, json };
}
beforeEach(() => {
  h.failure = null;
  h.update.mockClear();
  h.rules = [
    { id: 31n, agentId: "bot-a", userId: "tenant-a", content: "Old rule", priority: 8 },
    { id: 32n, agentId: "bot-b", userId: "tenant-a", content: "Other Bot", priority: 5 },
    { id: 33n, agentId: "bot-a", userId: "tenant-b", content: "Other tenant", priority: 5 },
    {
      id: 34n,
      agentId: "bot-a",
      userId: "tenant-a",
      content: "Opening greeting: Hello",
      priority: 5,
    },
  ];
});

describe("owned operating-rule editing", () => {
  it("updates one existing rule in place, retains priority, and returns canonical content", async () => {
    const { result, json } = request("  Follow the saved Calendar mode.  ");
    await result;
    expect(h.rules).toHaveLength(4);
    expect(h.rules[0]).toMatchObject({
      id: 31n,
      content: "Follow the saved Calendar mode.",
      priority: 8,
    });
    expect(h.rules.slice(1).map((rule) => rule.content)).toEqual([
      "Other Bot",
      "Other tenant",
      "Opening greeting: Hello",
    ]);
    expect(json).toHaveBeenCalledWith({
      success: true,
      directive: { id: "31", content: "Follow the saved Calendar mode.", priority: 8 },
    });
    await request("Second revision").result;
    expect(h.rules).toHaveLength(4);
    expect(h.rules[0].content).toBe("Second revision");
  });

  it("cannot modify another tenant or Bot, or silently succeed for a missing rule", async () => {
    await expect(request("Changed", "31", "tenant-b").result).rejects.toMatchObject({
      status: 404,
    });
    expect(h.update).not.toHaveBeenCalled();
    for (const id of ["32", "33", "99"]) {
      await expect(request("Changed", id).result).rejects.toMatchObject({ status: 404 });
    }
    expect(h.rules.map((rule) => rule.content)).toEqual([
      "Old rule",
      "Other Bot",
      "Other tenant",
      "Opening greeting: Hello",
    ]);
  });

  it("validates content and bounded positive IDs before touching any rule", async () => {
    for (const invalid of ["", "   ", null, 42, {}]) {
      await expect(request(invalid).result).rejects.toMatchObject({ status: 400 });
    }
    for (const id of ["0", "-1", "1.2", "nope", "9223372036854775808", "9".repeat(100)]) {
      await expect(request("New rule", id).result).rejects.toMatchObject({ status: 400 });
    }
    expect(h.update).not.toHaveBeenCalled();
    await request("a".repeat(12_001)).result;
    expect(h.rules[0].content).toHaveLength(12_000);
  });

  it("preserves greeting synchronization by refusing generic greeting changes", async () => {
    await expect(request("Opening greeting: Different").result).rejects.toMatchObject({
      status: 400,
    });
    await expect(request("Changed", "34").result).rejects.toMatchObject({ status: 404 });
    expect(h.rules[3].content).toBe("Opening greeting: Hello");
  });

  it("propagates a failed write without success or a duplicate rule", async () => {
    h.failure = new Error("Database unavailable");
    const { result, json } = request("New rule");
    await expect(result).rejects.toThrow("Database unavailable");
    expect(json).not.toHaveBeenCalled();
    expect(h.rules).toHaveLength(4);
    expect(h.rules[0].content).toBe("Old rule");
  });
});
