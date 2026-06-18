import express, { type NextFunction, type Request, type Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  apiErrorBody,
  mountRouteTestRequestContext,
  mountTestErrorHandler,
} from "../../tests/helpers/express-test-app";
import agentRoutes from "./agent-routes";

const h = vi.hoisted(() => {
  type Table = { __name: string } & Record<string, string>;
  type SelectResult = unknown[] | Error;

  const makeTable = (name: string, columns: string[]): Table => ({
    __name: name,
    ...Object.fromEntries(columns.map((column) => [column, `${name}.${column}`])),
  });

  const schema = {
    agents: makeTable("agents", [
      "id",
      "userId",
      "createdAt",
      "flowConfig",
      "name",
      "channel",
      "role",
      "voiceId",
      "firstMessage",
      "enabledTools",
      "systemPromptOverride",
      "kpiFocus",
    ]),
    personality: makeTable("personality", ["agentId", "userId", "content"]),
    directives: makeTable("directives", [
      "id",
      "agentId",
      "userId",
      "content",
      "priority",
      "createdAt",
    ]),
    knowledge: makeTable("knowledge", ["id", "agentId", "userId", "content", "createdAt"]),
    callLogs: makeTable("callLogs", [
      "id",
      "agentId",
      "userId",
      "leadScore",
      "durationSeconds",
      "sentiment",
      "createdAt",
    ]),
    appointments: makeTable("appointments", ["id", "agentId", "userId", "createdAt"]),
    outboundLeads: makeTable("outboundLeads", ["agentId", "userId"]),
    fleetTasks: makeTable("fleetTasks", [
      "id",
      "agentId",
      "userId",
      "sourceId",
      "sourceType",
      "createdAt",
    ]),
    phoneNumbers: makeTable("phoneNumbers", ["agentId", "userId"]),
    signalPresence: makeTable("signalPresence", ["agentId", "userId"]),
    agentLessons: makeTable("agentLessons", ["id", "agentId", "userId", "createdAt"]),
  };

  const state = {
    selectResults: [] as SelectResult[],
    selectCalls: [] as Array<{ table?: string; shape?: Record<string, unknown> }>,
    inserts: [] as Array<{ table: string; value: unknown; conflict?: unknown }>,
    updates: [] as Array<{ table: string; values: Record<string, unknown>; condition: unknown }>,
    deletes: [] as Array<{ table: string; condition: unknown }>,
    updateError: null as Error | null,
    deleteError: null as Error | null,
    insertError: null as Error | null,
  };

  function nextSelectResult(): Promise<unknown[]> {
    const result = state.selectResults.shift() ?? [];
    if (result instanceof Error) return Promise.reject(result);
    return Promise.resolve(result);
  }

  function createSelectBuilder(shape?: Record<string, unknown>) {
    let tableName: string | undefined;
    let resolved: Promise<unknown[]> | undefined;
    const finalResult = () => {
      resolved ??= nextSelectResult();
      return resolved;
    };
    const builder = {
      from(table: Table) {
        tableName = table.__name;
        state.selectCalls.push({ table: tableName, shape });
        return builder;
      },
      where() {
        return builder;
      },
      orderBy() {
        return builder;
      },
      limit() {
        return finalResult();
      },
      then<TResult1 = unknown[], TResult2 = never>(
        onfulfilled?: ((value: unknown[]) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
      ) {
        return finalResult().then(onfulfilled, onrejected);
      },
    };
    return builder;
  }

  const drizzle = {
    select: vi.fn((shape?: Record<string, unknown>) => createSelectBuilder(shape)),
    insert: vi.fn((table: Table) => ({
      values(value: unknown) {
        state.inserts.push({ table: table.__name, value });
        if (state.insertError) throw state.insertError;
        return {
          onConflictDoUpdate(conflict: unknown) {
            state.inserts[state.inserts.length - 1].conflict = conflict;
            return Promise.resolve();
          },
        };
      },
    })),
    update: vi.fn((table: Table) => ({
      set(values: Record<string, unknown>) {
        return {
          where(condition: unknown) {
            if (state.updateError) return Promise.reject(state.updateError);
            state.updates.push({ table: table.__name, values, condition });
            return Promise.resolve();
          },
        };
      },
    })),
    delete: vi.fn((table: Table) => ({
      where(condition: unknown) {
        if (state.deleteError) return Promise.reject(state.deleteError);
        state.deletes.push({ table: table.__name, condition });
        return Promise.resolve();
      },
    })),
    transaction: vi.fn(async (fn: (tx: typeof drizzle) => Promise<void>) => fn(drizzle)),
  };

  const log = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };

  const auditLogger = {
    logAgentOperation: vi.fn().mockResolvedValue(undefined),
  };

  return { state, schema, drizzle, log, auditLogger };
});

vi.mock("../env", () => ({ env: { DATABASE_URL: "postgres://test" } }));
vi.mock("../db/schema", () => h.schema);
vi.mock("drizzle-orm", () => ({
  eq: (left: string, right: unknown) => ({ op: "eq", left, right }),
  and: (...conditions: unknown[]) => ({ op: "and", conditions }),
  desc: (column: string) => ({ op: "desc", column }),
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ op: "sql", strings, values }),
}));
vi.mock("../middleware/auth", () => ({
  authenticateUser: (
    req: Request & { user?: { id: string; email: string } },
    _res: Response,
    next: NextFunction,
  ) => {
    const testUser = req.headers["x-test-user"] as string | undefined;
    const id = testUser || "user-1";
    req.user = { id, email: `${id}@example.com` };
    next();
  },
}));
vi.mock("../lib/server-context", () => ({
  drizzle: h.drizzle,
  log: h.log,
  auditLogger: h.auditLogger,
  tenantStore: { run: (_id: string, fn: () => unknown) => fn(), getStore: () => undefined },
}));
vi.mock("../lib/claude-brain", () => ({
  isClaudeAvailable: vi.fn(() => false),
  runStructured: vi.fn(),
}));
vi.mock("../lib/trial-gate", () => ({
  enforceTrialAgentCap: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock("../lib/sentry-events", () => ({ SentryEvents: { captureAgentCreated: vi.fn() } }));
vi.mock("../lib/auth-service", () => ({ isOwnerEmail: vi.fn(() => false) }));
vi.mock("../lib/agent-entitlements", () => ({
  agentCapHit: vi.fn(() => false),
  resolveAgentEntitlement: vi.fn(async () => ({ cap: 5, used: 0 })),
}));
vi.mock("../data/voice-roster", () => ({ pickRotatedVoiceId: vi.fn(() => "voice-1") }));

async function buildApp() {
  const app = express();
  mountRouteTestRequestContext(app);
  app.use(express.json());
  app.use(agentRoutes);
  mountTestErrorHandler(app);
  return app;
}

describe("agent routes integration", () => {
  beforeEach(() => {
    h.state.selectResults = [];
    h.state.selectCalls = [];
    h.state.inserts = [];
    h.state.updates = [];
    h.state.deletes = [];
    h.state.updateError = null;
    h.state.deleteError = null;
    h.state.insertError = null;
    vi.clearAllMocks();
  });

  it("returns available role metadata and personality templates", async () => {
    const response = await request(await buildApp()).get("/api/agents/roles");

    expect(response.status).toBe(200);
    expect(response.body.roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "sales", label: "Sales", color: "amber" }),
        expect.objectContaining({ value: "customer_service", label: "Customer Service" }),
      ]),
    );
    expect(response.body.templates).toEqual(
      expect.objectContaining({ sales: expect.any(String), customer_service: expect.any(String) }),
    );
  });

  it("lists agents owned by the authenticated user and maps rows to snake case", async () => {
    h.state.selectResults = [
      [
        {
          id: "agent-1",
          userId: "user-1",
          voiceId: "voice-a",
          firstMessage: "Hello",
          enabledTools: ["calendar"],
          createdAt: new Date("2026-01-02T03:04:05.000Z"),
        },
      ],
    ];

    const response = await request(await buildApp()).get("/api/agents");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      agents: [
        {
          id: "agent-1",
          user_id: "user-1",
          voice_id: "voice-a",
          first_message: "Hello",
          enabled_tools: ["calendar"],
          created_at: "2026-01-02T03:04:05.000Z",
        },
      ],
    });
    // listAgentsForUser now uses an explicit projection (AGENT_LIST_FALLBACK_SELECT)
    // so a production DB lagging a Drizzle column migration can't 503 the roster.
    expect(h.state.selectCalls[0]).toEqual({
      table: "agents",
      shape: {
        id: "agents.id",
        userId: "agents.userId",
        name: "agents.name",
        role: "agents.role",
        channel: "agents.channel",
        voiceId: "agents.voiceId",
        firstMessage: "agents.firstMessage",
        enabledTools: "agents.enabledTools",
        createdAt: "agents.createdAt",
      },
    });
  });

  it("returns degraded 503 when listing agents fails", async () => {
    h.state.selectResults = [new Error("database offline")];

    const response = await request(await buildApp()).get("/api/agents");

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      code: "SERVICE_UNAVAILABLE",
      agents: [],
      degraded: true,
      error: "Failed to fetch agents",
      requestId: "test-request-id",
    });
    expect(h.log.warn).toHaveBeenCalledWith(
      "Failed to fetch agents",
      expect.objectContaining({ userId: "user-1", error: "database offline" }),
    );
  });

  it("loads an agent configuration from agent, personality, directives, and knowledge rows", async () => {
    h.state.selectResults = [
      [{ id: "agent-1" }],
      [{ flowConfig: { nodes: [{ id: "start" }] } }],
      [{ content: "Warm and concise" }],
      [{ id: 2, content: "Always confirm the phone number", priority: 8 }],
      [{ id: 7, content: "Open weekdays" }],
    ];

    const response = await request(await buildApp()).get("/api/agent-config/agent-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      flowConfig: { nodes: [{ id: "start" }] },
      // Training dashboard reads role + archetype alongside the config; the
      // route defaults them when the agent row predates the columns.
      role: "customer_service",
      archetype: "Receptionist",
      personality: "Warm and concise",
      directives: [{ id: 2, content: "Always confirm the phone number", priority: 8 }],
      knowledge: [{ id: 7, content: "Open weekdays" }],
    });
    expect(h.state.selectCalls.map((call) => call.table)).toEqual([
      "agents",
      "agents",
      "personality",
      "directives",
      "knowledge",
    ]);
  });

  it("returns 404 when loading configuration for an agent the user does not own", async () => {
    h.state.selectResults = [[]];

    const response = await request(await buildApp()).get("/api/agent-config/missing-agent");

    expect(response.status).toBe(404);
    expect(response.body).toEqual(apiErrorBody("Agent not found.", "NOT_FOUND"));
  });

  it("returns a 500 when loading agent configuration fails", async () => {
    h.state.selectResults = [[{ id: "agent-1" }], new Error("config query failed"), [], [], []];

    const response = await request(await buildApp()).get("/api/agent-config/agent-1");

    expect(response.status).toBe(500);
    expect(response.body).toEqual(
      apiErrorBody("Failed to load agent configuration", "INTERNAL_ERROR"),
    );
    expect(h.log.error).toHaveBeenCalledWith(
      "Config fetch error",
      expect.objectContaining({ error: "config query failed" }),
    );
  });

  it("rejects unknown role templates without querying the database", async () => {
    const response = await request(await buildApp())
      .post("/api/agents/agent-1/apply-role")
      .send({ role: "made_up_role" });

    expect(response.status).toBe(400);
    expect(response.body).toEqual(apiErrorBody("Unknown role", "BAD_REQUEST"));
    expect(h.drizzle.select).not.toHaveBeenCalled();
  });

  it("returns a 404 when applying a known role to an agent the user does not own", async () => {
    h.state.selectResults = [[]];

    const response = await request(await buildApp())
      .post("/api/agents/agent-1/apply-role")
      .send({ role: "sales" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(apiErrorBody("Agent not found", "NOT_FOUND"));
    expect(h.state.inserts).toEqual([]);
  });

  it("applies a known role template to an owned agent", async () => {
    h.state.selectResults = [[{ id: "agent-1" }]];

    const response = await request(await buildApp())
      .post("/api/agents/agent-1/apply-role")
      .send({ role: "sales" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, content: expect.any(String) });
    expect(response.body.content).toContain("sales");
    expect(h.state.inserts).toEqual([
      expect.objectContaining({
        table: "personality",
        value: { agentId: "agent-1", userId: "user-1", content: response.body.content },
        conflict: expect.objectContaining({ set: { content: response.body.content } }),
      }),
    ]);
  });

  it("returns 404 when saving training data for an agent the user does not own", async () => {
    h.state.selectResults = [[]];

    const response = await request(await buildApp())
      .post("/api/train/save")
      .set("x-test-user", "user-a")
      .send({
        agentId: "agent-1",
        extracted: {
          directives: [{ content: "bad", priority: 5 }],
          knowledge: [],
          personality: "",
        },
      });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(apiErrorBody("Agent not found.", "NOT_FOUND"));
    expect(h.state.inserts).toEqual([]);
  });

  it("returns 404 when updating an agent the user does not own", async () => {
    h.state.selectResults = [[]];

    const response = await request(await buildApp())
      .put("/api/agents/agent-1")
      .set("x-test-user", "user-a")
      .send({ name: "Hijacked", role: "sales" });

    expect(response.status).toBe(404);
    expect(response.body).toEqual(apiErrorBody("Agent not found.", "NOT_FOUND"));
    expect(h.state.updates).toEqual([]);
  });

  it("updates an owned agent after ownership check", async () => {
    h.state.selectResults = [[{ id: "agent-1" }]];

    const response = await request(await buildApp())
      .put("/api/agents/agent-1")
      .send({ name: "Renamed", role: "sales" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(h.state.updates).toEqual([
      expect.objectContaining({
        table: "agents",
        values: expect.objectContaining({ name: "Renamed" }),
      }),
    ]);
  });

  it("returns a 404 when deleting an agent the user does not own", async () => {
    h.state.selectResults = [[]];

    const response = await request(await buildApp()).delete("/api/agents/agent-1");

    expect(response.status).toBe(404);
    expect(response.body).toEqual(apiErrorBody("Agent not found.", "NOT_FOUND"));
    expect(h.state.updates).toEqual([]);
    expect(h.state.deletes).toEqual([]);
  });

  it("nulls dependent rows and deletes an owned agent", async () => {
    h.state.selectResults = [[{ id: "agent-1" }]];

    const response = await request(await buildApp()).delete("/api/agents/agent-1");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(h.state.updates.map((update) => [update.table, update.values])).toEqual([
      ["callLogs", { agentId: null }],
      ["appointments", { agentId: null }],
      ["outboundLeads", { agentId: null }],
      ["fleetTasks", { agentId: null }],
      ["phoneNumbers", { agentId: null }],
      ["signalPresence", { agentId: null }],
    ]);
    expect(h.state.deletes).toEqual([expect.objectContaining({ table: "agents" })]);
    expect(h.auditLogger.logAgentOperation).toHaveBeenCalledWith(
      "deleted",
      expect.objectContaining({ userId: "user-1", agentId: "agent-1" }),
    );
  });

  it("returns a 500 when deleting an agent fails", async () => {
    h.state.selectResults = [new Error("select failed")];

    const response = await request(await buildApp()).delete("/api/agents/agent-1");

    expect(response.status).toBe(500);
    expect(response.body).toEqual(apiErrorBody("Failed to delete agent.", "INTERNAL_ERROR"));
    expect(h.log.error).toHaveBeenCalledWith(
      "Failed to delete agent",
      expect.objectContaining({ error: "select failed" }),
    );
  });
});
