import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountRouteTestRequestContext,
  mountTestErrorHandler,
} from "../../tests/helpers/express-test-app";
import campaignRoutes from "./campaign-routes";

const h = vi.hoisted(() => {
  type Table = { __name: string } & Record<string, string>;

  const makeTable = (name: string, columns: string[]): Table => ({
    __name: name,
    ...Object.fromEntries(columns.map((column) => [column, `${name}.${column}`])),
  });

  const schema = {
    outboundCampaigns: makeTable("outboundCampaigns", [
      "id",
      "userId",
      "name",
      "status",
      "createdAt",
      "callWindowStart",
      "callWindowEnd",
      "updatedAt",
    ]),
    outboundLeads: makeTable("outboundLeads", [
      "id",
      "campaignId",
      "userId",
      "status",
      "createdAt",
      "customerName",
      "customerNumber",
    ]),
    agents: makeTable("agents", ["id", "userId"]),
    callLogs: makeTable("callLogs", ["id", "userId", "durationSeconds", "cost", "leadScore"]),
  };

  const state = {
    campaigns: [] as Array<Record<string, unknown>>,
    leadStats: [] as Array<Record<string, unknown>>,
    leads: [] as Array<Record<string, unknown>>,
  };

  function createSelectBuilder(shape?: Record<string, unknown>) {
    let tableName: string | undefined;

    const resolve = () => {
      if (tableName === "outboundCampaigns") return Promise.resolve(state.campaigns);
      if (tableName === "outboundLeads") {
        if (shape?.count) return Promise.resolve([{ count: state.leads.length }]);
        if (shape?.campaignId) return Promise.resolve(state.leadStats);
        return Promise.resolve(state.leads);
      }
      if (tableName === "callLogs") return Promise.resolve([]);
      return Promise.resolve([]);
    };

    const builder: any = {
      from(table: Table) {
        tableName = table.__name;
        return builder;
      },
      where() {
        return builder;
      },
      orderBy() {
        return builder;
      },
      groupBy() {
        return resolve();
      },
      limit() {
        return builder;
      },
      offset() {
        return resolve();
      },
      then(onfulfilled?: (value: unknown[]) => unknown, onrejected?: (reason: unknown) => unknown) {
        return resolve().then(onfulfilled, onrejected);
      },
    };

    return builder;
  }

  return {
    schema,
    state,
    drizzle: {
      select: vi.fn((shape?: Record<string, unknown>) => createSelectBuilder(shape)),
      insert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  };
});

vi.mock("../lib/server-context", () => ({
  drizzle: h.drizzle,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../db/schema", () => h.schema);

vi.mock("../middleware/auth", () => ({
  authenticateUser: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: "user-1" };
    next();
  }),
}));

vi.mock("../middleware/api-rate-limits", () => ({
  claudeRateLimiter: vi.fn((_req: any, _res: any, next: any) => next()),
  campaignWriteRateLimit: vi.fn((_req: any, _res: any, next: any) => next()),
}));

vi.mock("../lib/campaign-analytics", () => ({
  computeOutcomeBreakdown: vi.fn(() => ({ total: 0, outcomes: [] })),
  computeCallStats: vi.fn(() => ({})),
}));

vi.mock("drizzle-orm", () => ({
  eq: (left: string, right: unknown) => ({ left, right }),
  and: (...conds: unknown[]) => ({ op: "and", conds }),
  sql: (strings: TemplateStringsArray) => strings.join(""),
  desc: (column: string) => ({ column, direction: "desc" }),
  inArray: (left: string, right: unknown[]) => ({ left, right }),
  isNotNull: (column: string) => ({ column, op: "isNotNull" }),
}));

async function buildApp() {
  const app = express();
  mountRouteTestRequestContext(app);
  app.use(express.json());
  app.use(campaignRoutes);
  mountTestErrorHandler(app);
  return app;
}

describe("campaign routes", () => {
  beforeEach(() => {
    h.state.campaigns = [
      {
        id: "camp-1",
        name: "Win Back",
        status: "draft",
        createdAt: new Date("2026-01-02T03:04:05.000Z"),
        callWindowStart: "09:00",
        callWindowEnd: "17:00",
      },
    ];
    h.state.leadStats = [{ campaignId: "camp-1", total: 3, dialed: 2, connected: 1 }];
    h.state.leads = [
      {
        id: 123n,
        campaignId: "camp-1",
        userId: "user-1",
        customerName: "Ada Lovelace",
        customerNumber: "+15551234567",
        status: "Queued",
        createdAt: new Date("2026-01-02T03:04:05.000Z"),
      },
    ];
  });

  it("returns campaigns in snake_case for the outbound UI", async () => {
    const response = await request(await buildApp()).get("/api/campaigns");

    expect(response.status).toBe(200);
    expect(response.body.campaigns).toEqual([
      expect.objectContaining({
        id: "camp-1",
        call_window_start: "09:00",
        call_window_end: "17:00",
        created_at: "2026-01-02T03:04:05.000Z",
        leads_count: 3,
        dialed_count: 2,
        connected_count: 1,
      }),
    ]);
    expect(response.body.campaigns[0]).not.toHaveProperty("callWindowStart");
  });

  it("returns campaign leads in snake_case for the campaign detail pane", async () => {
    const response = await request(await buildApp()).get("/api/campaigns/camp-1/leads");

    expect(response.status).toBe(200);
    expect(response.body.leads).toEqual([
      expect.objectContaining({
        id: "123",
        campaign_id: "camp-1",
        customer_name: "Ada Lovelace",
        customer_number: "+15551234567",
        created_at: "2026-01-02T03:04:05.000Z",
      }),
    ]);
    expect(response.body.leads[0]).not.toHaveProperty("customerName");
  });
});
