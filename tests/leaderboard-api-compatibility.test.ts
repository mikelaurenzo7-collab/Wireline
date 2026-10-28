import { describe, expect, it, vi } from "vitest";

type Handler = (req: any, res: any) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler[]>(),
  authenticate: vi.fn(),
  selectIndex: 0,
}));
vi.mock("express", () => ({
  Router: () => ({ get: (path: string, ...handlers: Handler[]) => h.routes.set(path, handlers) }),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const rows = [
        [{ id: "bot-a", name: "Nora", markKey: "spark-rose", role: null, channel: "voice" }],
        [
          {
            agentId: "bot-a",
            totalCalls: 4,
            qualified: 2,
            highIntent: 1,
            minutes: 5,
            cost: "1",
            avgScore: 70,
          },
        ],
        [{ agentId: "bot-a", bookings: 1 }],
        [{ agentId: "bot-a", aiCost: "0.2" }],
      ];
      h.selectIndex = 0;
      const tx = {
        select: () => {
          const result = rows[h.selectIndex++];
          const query = {
            from: () => query,
            where: () => query,
            limit: async () => result,
            groupBy: async () => result,
          };
          return query;
        },
      };
      return fn(tx);
    },
  },
  serialQueryBatch: (queries: Promise<unknown>[]) => Promise.all(queries),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: h.authenticate }));
vi.mock("../src/middleware/api-rate-limits", () => ({ createRateLimiter: () => vi.fn() }));
vi.mock("../src/lib/spend-guards", () => ({
  enforceSpendCap: vi.fn(),
  enforce24hSpendCap: vi.fn(),
}));
vi.mock("../src/middleware/audit-middleware", () => ({ withAudit: () => vi.fn() }));
vi.mock("../src/lib/ai-response-helpers", () => ({ aiErr: vi.fn() }));
vi.mock("../src/lib/daily-brief", () => ({ computeDailyBrief: vi.fn() }));

import "../src/routes/insights-routes";
import { getOpenApiSpec } from "../src/lib/openapi-spec";

describe("legacy leaderboard API", () => {
  it("keeps the authenticated route and its response shape for existing clients", async () => {
    const handlers = h.routes.get("/api/insights/leaderboard");
    expect(handlers?.[0]).toBe(h.authenticate);
    const res = { json: vi.fn() };
    await handlers?.at(-1)?.({ user: { id: "tenant-a" }, query: { days: "30" } }, res);
    expect(res.json).toHaveBeenCalledWith({
      window_days: 30,
      agents: [
        expect.objectContaining({
          agent_id: "bot-a",
          agent_name: "Nora",
          total_calls: 4,
          qualified: 2,
          bookings: 1,
          avg_lead_score: 70,
          cost: 1,
          ai_cost: 0.2,
          total_cost: 1.2,
          conversion_rate: 50,
        }),
      ],
    });
    expect(getOpenApiSpec().paths).toHaveProperty("/api/insights/leaderboard");
  });
});
