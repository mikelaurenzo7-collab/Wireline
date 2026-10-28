import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuditContext, recordUsage, runInAuditContext } from "../src/lib/ai-audit";

type Handler = (req: any, res: any) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  cache: new Map<string, unknown>(),
  available: true,
  cluster: vi.fn(),
}));
vi.mock("express", () => ({
  Router: () => ({
    get: (path: string, ...handlers: Handler[]) => h.routes.set(path, handlers.at(-1)!),
  }),
}));
vi.mock("../src/lib/server-context", () => ({
  drizzle: {
    select: () => ({
      from: () => ({
        where: () => ({
          orderBy: () => ({
            limit: async () => [{ summary: "a" }, { summary: "b" }, { summary: "c" }],
          }),
        }),
      }),
    }),
  },
  serialQueryBatch: vi.fn(),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/api-rate-limits", () => ({ createRateLimiter: () => vi.fn() }));
vi.mock("../src/lib/spend-guards", () => ({
  enforceSpendCap: vi.fn(),
  enforce24hSpendCap: vi.fn(),
}));
vi.mock("../src/middleware/audit-middleware", () => ({ withAudit: () => vi.fn() }));
vi.mock("../src/lib/insights-ai", () => ({
  isInsightsAiAvailable: () => h.available,
  clusterTopics: (...args: unknown[]) => h.cluster(...args),
}));
vi.mock("../src/lib/insights-cache", () => ({
  cachedInsight: (key: string) => h.cache.get(key),
  setCachedInsight: (key: string, value: unknown) => h.cache.set(key, value),
}));
vi.mock("../src/lib/ai-response-helpers", () => ({
  aiErr: (res: any) => res.status(500).json({ error: "AI request failed" }),
}));
vi.mock("../src/lib/daily-brief", () => ({ computeDailyBrief: vi.fn() }));

import "../src/routes/insights-routes";

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() };
}
function request(user: string, query: Record<string, string> = {}) {
  return { user: { id: user }, query };
}

beforeEach(() => {
  h.cache.clear();
  h.available = true;
  h.cluster.mockReset();
});

describe("topics computation", () => {
  it("shares a tenant/window computation and waits for usage before responding", async () => {
    let finish!: () => void;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    h.cluster.mockImplementation(async () => {
      await held;
      recordUsage("gpt-4o", { usage: { input_tokens: 12, output_tokens: 4 } }, 5);
      return { topics: [{ name: "Hours", count: 3, category: "service" }], total_analyzed: 3 };
    });
    const owner = createAuditContext();
    const other = createAuditContext();
    const first = response();
    const second = response();
    const route = h.routes.get("/api/insights/topics")!;
    const one = runInAuditContext(owner, () => route(request("tenant"), first));
    const two = runInAuditContext(other, () => route(request("tenant"), second));
    await vi.waitFor(() => expect(h.cluster).toHaveBeenCalledTimes(1));
    expect(first.json).not.toHaveBeenCalled();
    expect(second.json).not.toHaveBeenCalled();
    finish();
    await Promise.all([one, two]);
    expect(owner.records).toHaveLength(1);
    expect(other.records).toHaveLength(0);
    expect(first.json).toHaveBeenCalledWith(expect.objectContaining({ total_analyzed: 3 }));
    expect(second.json).toHaveBeenCalledWith(expect.objectContaining({ total_analyzed: 3 }));
    const cached = response();
    await route(request("tenant"), cached);
    expect(cached.json).toHaveBeenCalledWith(expect.objectContaining({ cached: true }));
    expect(h.cluster).toHaveBeenCalledTimes(1);
  });

  it("returns a recoverable error when AI is unavailable", async () => {
    h.available = false;
    const res = response();
    await h.routes.get("/api/insights/topics")!(request("offline"), res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: "AI_RUNTIME_OFFLINE" }));
    expect(h.cluster).not.toHaveBeenCalled();
  });

  it("allows retry after failure and isolates tenants", async () => {
    h.cluster
      .mockRejectedValueOnce(new Error("failed"))
      .mockResolvedValue({ topics: [], total_analyzed: 3 });
    const route = h.routes.get("/api/insights/topics")!;
    const failed = response();
    await route(request("tenant-failure"), failed);
    expect(failed.status).toHaveBeenCalledWith(500);
    const retry = response();
    await route(request("tenant-failure"), retry);
    const other = response();
    await route(request("tenant-other"), other);
    expect(h.cluster).toHaveBeenCalledTimes(3);
    expect(retry.json).toHaveBeenCalledWith(expect.objectContaining({ total_analyzed: 3 }));
    expect(other.json).toHaveBeenCalledWith(expect.objectContaining({ total_analyzed: 3 }));
  });
});
