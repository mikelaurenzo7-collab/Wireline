import { beforeEach, describe, expect, it, vi } from "vitest";
import { AgentBusinessProfileSchema } from "../src/lib/form-validators";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  row: {} as Record<string, unknown>,
  writes: [] as Array<Record<string, unknown>>,
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
  const select = (fields: Record<string, unknown>) => ({
    from: () => ({
      where: (where: Parameters<typeof dialect.sqlToQuery>[0]) => {
        const { params } = dialect.sqlToQuery(where);
        const owned = params[0] === "bot-a" && params[1] === "tenant-a";
        return fields.id
          ? { limit: async () => (owned ? [{ id: "bot-a" }] : []) }
          : fields.legacyPhone
            ? {
                limit: async () =>
                  owned
                    ? [
                        {
                          phone: h.row.escalationPhone,
                          legacyPhone: h.row.transferPhone,
                          email: h.row.escalationEmail,
                          transfer: h.row.escalationHandoffEnabled,
                        },
                      ]
                    : [],
              }
            : Promise.resolve(owned ? [{ phone: "+13125550124" }] : []);
      },
    }),
  });
  return {
    log: { warn: vi.fn(), error: vi.fn() },
    drizzle: {
      select,
      transaction: async (operation: (tx: unknown) => Promise<unknown>) => {
        let unlock: (() => void) | undefined;
        const tx = {
          execute: async (statement: Parameters<typeof dialect.sqlToQuery>[0]) => {
            const { sql, params } = dialect.sqlToQuery(statement);
            expect(sql).toMatch(/FOR UPDATE/);
            expect(params).toEqual(["bot-a", "tenant-a"]);
            const prior = h.lockTail;
            h.lockTail = new Promise((resolve) => {
              unlock = resolve;
            });
            await prior;
          },
          select,
          update: () => ({
            set: (patch: Record<string, unknown>) => ({
              where: (where: Parameters<typeof dialect.sqlToQuery>[0]) => ({
                returning: async () => {
                  expect(dialect.sqlToQuery(where).params).toEqual(["bot-a", "tenant-a"]);
                  h.writes.push(patch);
                  Object.assign(h.row, patch);
                  return [{ ...h.row }];
                },
              }),
            }),
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

function save(body: unknown, userId = "tenant-a") {
  const json = vi.fn();
  const result = h.routes.get("patch /api/agent-config/:id/business")!(
    { user: { id: userId }, params: { id: "bot-a" }, body: AgentBusinessProfileSchema.parse(body) },
    { json },
  );
  return { result, json };
}
beforeEach(() => {
  h.lockTail = Promise.resolve();
  h.writes = [];
  h.row = {
    businessHours: { mon: { open: "09:00", close: "17:00" } },
    timezone: "America/Chicago",
    complianceMode: "strict",
    disallowedTopics: ["medical advice"],
    escalationKeywords: ["manager"],
    escalationPhone: null,
    transferPhone: "+13125550123",
    escalationEmail: "owner@example.com",
    escalationHandoffEnabled: true,
    businessVariables: null,
    outOfHoursMessage: "Closed",
    kpiFocus: null,
    isBusinessAgent: true,
  };
});

describe("human handoff business-profile saves", () => {
  it("clears both the visible destination and legacy fallback while preserving hours and unrelated rules", async () => {
    const { result, json } = save({
      escalation_phone: null,
      escalation_email: null,
      escalation_handoff_enabled: false,
    });
    await result;
    expect(h.writes).toEqual([
      {
        escalationPhone: null,
        transferPhone: null,
        escalationEmail: null,
        escalationHandoffEnabled: false,
      },
    ]);
    expect(h.row).toMatchObject({
      timezone: "America/Chicago",
      complianceMode: "strict",
      outOfHoursMessage: "Closed",
      businessHours: { mon: { open: "09:00", close: "17:00" } },
    });
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        businessProfile: expect.objectContaining({
          escalation_phone: null,
          transfer_phone: null,
          escalation_email: null,
          escalation_handoff_enabled: false,
        }),
      }),
    );
  });

  it("refuses invalid or looping destinations before writing, including an enable without a number", async () => {
    for (const phone of ["Call +13125550123", "+13125550123 ext 5", "312-555-0124"])
      await expect(save({ escalation_phone: phone }).result).rejects.toMatchObject({ status: 400 });
    await expect(save({ escalation_phone: null }).result).rejects.toMatchObject({ status: 400 });
    expect(h.writes).toEqual([]);
    await save({ escalation_phone: "(312) 555-0123", escalation_handoff_enabled: true }).result;
    expect(h.row.escalationPhone).toBe("+13125550123");
  });

  it("does not mutate another tenant and does not touch routing during an hours-only save", async () => {
    await expect(
      save({ escalation_handoff_enabled: false }, "tenant-b").result,
    ).rejects.toMatchObject({ status: 404 });
    expect(h.writes).toEqual([]);
    await save({ timezone: "UTC", business_hours: null }).result;
    expect(h.writes).toEqual([{ timezone: "UTC", businessHours: null }]);
    expect(h.row.escalationHandoffEnabled).toBe(true);
    expect(h.row.transferPhone).toBe("+13125550123");
  });

  it("serializes a simultaneous clear and enable so enabled routing always has a destination", async () => {
    h.row.escalationHandoffEnabled = false;
    const results = await Promise.allSettled([
      save({ escalation_phone: null, escalation_handoff_enabled: false }).result,
      save({ escalation_handoff_enabled: true }).result,
    ]);
    expect(results[0].status).toBe("fulfilled");
    expect(results[1]).toMatchObject({ status: "rejected", reason: { status: 400 } });
    expect(h.row.escalationHandoffEnabled).toBe(false);
    expect(h.row.transferPhone).toBeNull();
  });
});
