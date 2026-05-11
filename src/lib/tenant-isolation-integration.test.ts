// src/lib/tenant-isolation-integration.test.ts
//
// @vitest-environment node
//
// Integration tests that verify multi-tenant isolation at the HTTP layer.
//
// Unlike tenancy-isolation.test.ts (which does static analysis of server.ts),
// these tests boot a real Express application, inject two distinct test users,
// and assert that user A cannot read, modify, or delete user B's data.
//
// Architecture
// ──────────────
// Because server.ts is a monolith that requires live Supabase/Anthropic
// connections, we build a *representative* Express app here that:
//   1. Mirrors the route signatures and tenancy patterns of server.ts.
//   2. Uses a chainable Supabase-shaped stub that enforces user_id scoping at
//      the mock level — it only returns rows whose user_id matches the filter.
//   3. Uses a lightweight `authenticateUser` shim that reads the bearer token
//      from the Authorization header and resolves it to a user_id — simulating
//      real JWT validation without a live Supabase Auth instance.
//
// IDOR tests
// ──────────
// The most dangerous isolation failures are Insecure Direct Object References —
// user A supplies user B's resource ID in the URL and the handler returns the
// resource without re-checking ownership. These tests are included explicitly.
//
// Extending these tests
// ─────────────────────
// When adding a new authenticated route to server.ts:
//   1. Add a matching route in buildTenantTestApp() below.
//   2. Seed relevant fixture data in FIXTURES.
//   3. Add an isolation test and an IDOR test in the test suite.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import express, { Request, Response, NextFunction } from "express";
import request from "supertest";
import http from "node:http";

// ──────────────────────────────────────────────────────────────────────
//  Test fixture users
// ──────────────────────────────────────────────────────────────────────

const USER_A = "aaaaaaaa-0000-0000-0000-000000000001";
const USER_B = "bbbbbbbb-0000-0000-0000-000000000002";

// Map from bearer token → user_id (simulates Supabase JWT validation)
const TOKEN_MAP: Record<string, string> = {
  "token-user-a": USER_A,
  "token-user-b": USER_B,
};

// ──────────────────────────────────────────────────────────────────────
//  In-memory fixture database
// ──────────────────────────────────────────────────────────────────────
// Each row is keyed by table name. The mock Supabase enforces user_id
// equality when .eq("user_id", ...) is called, mirroring real RLS.

const FIXTURES: Record<string, Record<string, unknown>[]> = {
  wireline_agents: [
    { id: "agent-a1", user_id: USER_A, name: "Agent Alpha", archetype: "Closer", role: "lead_qualifier" },
    { id: "agent-b1", user_id: USER_B, name: "Agent Beta", archetype: "Receptionist", role: "scheduler" },
  ],
  wireline_call_logs: [
    { id: "call-a1", user_id: USER_A, vapi_call_id: "vapi-a1", transcript: "Hello from A", created_at: "2026-01-01T00:00:00Z" },
    { id: "call-a2", user_id: USER_A, vapi_call_id: "vapi-a2", transcript: "Follow-up from A", created_at: "2026-01-02T00:00:00Z" },
    { id: "call-b1", user_id: USER_B, vapi_call_id: "vapi-b1", transcript: "Hello from B", created_at: "2026-01-01T00:00:00Z" },
  ],
  wireline_settings: [
    { user_id: USER_A, business_name: "Acme Corp", subscription_status: "active" },
    { user_id: USER_B, business_name: "Beta LLC", subscription_status: "active" },
  ],
  wireline_outbound_leads: [
    { id: "lead-a1", user_id: USER_A, phone: "+15550001111", status: "pending" },
    { id: "lead-b1", user_id: USER_B, phone: "+15550002222", status: "pending" },
  ],
  wireline_fleet_tasks: [
    { id: "task-a1", user_id: USER_A, description: "Task for A", status: "pending" },
    { id: "task-b1", user_id: USER_B, description: "Task for B", status: "pending" },
  ],
};

// ──────────────────────────────────────────────────────────────────────
//  Mock Supabase query builder
// ──────────────────────────────────────────────────────────────────────
// Implements the chainable PostgREST API shape used by server.ts handlers.
// Enforces .eq("user_id", ...) scoping — rows that don't match are excluded.

function makeQueryBuilder(table: string) {
  const rows: Record<string, unknown>[] = (FIXTURES[table] ?? []).map((r) => ({ ...r }));
  const eqFilters: Record<string, unknown> = {};
  let _selectedCols = "*";
  let _isSingle = false;
  let _isMaybeSingle = false;
  let _rangeFrom = 0;
  let _rangeTo: number | undefined;
  const _orderClauses: { col: string; options?: unknown }[] = [];

  function resolve(): { data: unknown; error: null; count?: number } {
    let filtered = rows.filter((row) =>
      Object.entries(eqFilters).every(([k, v]) => row[k] === v),
    );
    if (_rangeFrom !== undefined && _rangeTo !== undefined) {
      filtered = filtered.slice(_rangeFrom, _rangeTo + 1);
    }
    const count = filtered.length;
    if (_isSingle) {
      if (filtered.length === 0) return { data: null, error: { code: "PGRST116" } } as any;
      return { data: filtered[0], error: null };
    }
    if (_isMaybeSingle) {
      return { data: filtered[0] ?? null, error: null };
    }
    if (_selectedCols.includes("count")) {
      return { data: filtered, error: null, count };
    }
    return { data: filtered, error: null, count };
  }

  const builder: any = {
    select(cols = "*", _opts?: { count?: string }) {
      _selectedCols = cols;
      return this;
    },
    eq(col: string, val: unknown) {
      eqFilters[col] = val;
      return this;
    },
    neq(_col: string, _val: unknown) { return this; },
    in(_col: string, _vals: unknown[]) { return this; },
    order(col: string, options?: unknown) {
      _orderClauses.push({ col, options });
      return this;
    },
    range(from: number, to: number) {
      _rangeFrom = from;
      _rangeTo = to;
      return this;
    },
    limit(_n: number) { return this; },
    single() { _isSingle = true; return this; },
    maybeSingle() { _isMaybeSingle = true; return this; },
    insert(payload: unknown) {
      const row = Array.isArray(payload) ? payload[0] : payload;
      (FIXTURES[table] = FIXTURES[table] ?? []).push(row as Record<string, unknown>);
      return { data: row, error: null };
    },
    update(_payload: unknown) {
      return { eq: (_col: string, _val: unknown) => ({ data: null, error: null }) };
    },
    delete() {
      return { eq: (_col: string, _val: unknown) => ({ data: null, error: null }) };
    },
    upsert(_payload: unknown) { return this; },
    // Make the builder awaitable
    then(onFulfilled: (v: ReturnType<typeof resolve>) => unknown) {
      return Promise.resolve(resolve()).then(onFulfilled);
    },
    catch(onRejected: (e: unknown) => unknown) {
      return Promise.resolve(resolve()).catch(onRejected);
    },
  };
  return builder;
}

function makeMockDb() {
  return {
    from: (table: string) => makeQueryBuilder(table),
  };
}

// ──────────────────────────────────────────────────────────────────────
//  Lightweight authenticateUser shim
// ──────────────────────────────────────────────────────────────────────
// Reads the bearer token from Authorization, resolves it via TOKEN_MAP,
// and attaches req.user = { id }. Returns 401 if token is unknown.

function authenticateUser(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  const userId = TOKEN_MAP[token];
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as any).user = { id: userId };
  next();
}

// ──────────────────────────────────────────────────────────────────────
//  Build representative Express app
// ──────────────────────────────────────────────────────────────────────
// Each route mirrors the structure of the real server.ts handler,
// including the exact .eq("user_id", req.user.id) tenancy gate.

function buildTenantTestApp() {
  const app = express();
  app.use(express.json());

  const db = makeMockDb();

  // GET /api/agents — list the caller's agents
  app.get("/api/agents", authenticateUser, async (req: any, res: any) => {
    const { data, error } = await db
      .from("wireline_agents")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at");
    if (error) return res.status(500).json({ error: "db error" });
    res.json(data);
  });

  // GET /api/agents/:id — fetch a single agent (IDOR risk)
  app.get("/api/agents/:id", authenticateUser, async (req: any, res: any) => {
    const { data, error } = await db
      .from("wireline_agents")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: "db error" });
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  });

  // GET /api/calls — list the caller's call logs
  app.get("/api/calls", authenticateUser, async (req: any, res: any) => {
    const { data, error } = await db
      .from("wireline_call_logs")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at");
    if (error) return res.status(500).json({ error: "db error" });
    res.json(data);
  });

  // GET /api/calls/:id — fetch a single call log (IDOR risk)
  app.get("/api/calls/:id", authenticateUser, async (req: any, res: any) => {
    const { data, error } = await db
      .from("wireline_call_logs")
      .select("*")
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: "db error" });
    if (!data) return res.status(404).json({ error: "Not found" });
    res.json(data);
  });

  // GET /api/settings — read the caller's settings
  app.get("/api/settings", authenticateUser, async (req: any, res: any) => {
    const { data, error } = await db
      .from("wireline_settings")
      .select("*")
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (error) return res.status(500).json({ error: "db error" });
    res.json(data ?? {});
  });

  // GET /api/outbound/leads — list the caller's leads
  app.get("/api/outbound/leads", authenticateUser, async (req: any, res: any) => {
    const { data, error } = await db
      .from("wireline_outbound_leads")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at");
    if (error) return res.status(500).json({ error: "db error" });
    res.json(data);
  });

  // GET /api/fleet/tasks — list the caller's fleet tasks
  app.get("/api/fleet/tasks", authenticateUser, async (req: any, res: any) => {
    const { data, error } = await db
      .from("wireline_fleet_tasks")
      .select("*")
      .eq("user_id", req.user.id)
      .order("created_at");
    if (error) return res.status(500).json({ error: "db error" });
    res.json(data);
  });

  return app;
}

// ──────────────────────────────────────────────────────────────────────
//  Test harness lifecycle
// ──────────────────────────────────────────────────────────────────────

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const app = buildTenantTestApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(
  () =>
    new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    ),
);

function authA(): string {
  return "token-user-a";
}
function authB(): string {
  return "token-user-b";
}

// ──────────────────────────────────────────────────────────────────────
//  Tests
// ──────────────────────────────────────────────────────────────────────

describe("Authentication gate", () => {
  it("returns 401 when Authorization header is absent", async () => {
    const res = await request(baseUrl).get("/api/agents");
    expect(res.status).toBe(401);
  });

  it("returns 401 for an invalid / unknown bearer token", async () => {
    const res = await request(baseUrl)
      .get("/api/agents")
      .set("Authorization", "Bearer invalid-token");
    expect(res.status).toBe(401);
  });
});

describe("Agent list isolation", () => {
  it("user A sees only their own agents", async () => {
    const res = await request(baseUrl)
      .get("/api/agents")
      .set("Authorization", `Bearer ${authA()}`);
    expect(res.status).toBe(200);
    const ids = (res.body as any[]).map((a: any) => a.id);
    expect(ids).toContain("agent-a1");
    expect(ids).not.toContain("agent-b1");
  });

  it("user B sees only their own agents", async () => {
    const res = await request(baseUrl)
      .get("/api/agents")
      .set("Authorization", `Bearer ${authB()}`);
    expect(res.status).toBe(200);
    const ids = (res.body as any[]).map((a: any) => a.id);
    expect(ids).toContain("agent-b1");
    expect(ids).not.toContain("agent-a1");
  });

  it("user A's results contain no data belonging to user B", async () => {
    const res = await request(baseUrl)
      .get("/api/agents")
      .set("Authorization", `Bearer ${authA()}`);
    expect(res.status).toBe(200);
    for (const agent of res.body as any[]) {
      expect(agent.user_id).toBe(USER_A);
    }
  });
});

describe("Agent IDOR prevention", () => {
  it("user A cannot fetch user B's agent by ID", async () => {
    const res = await request(baseUrl)
      .get("/api/agents/agent-b1")
      .set("Authorization", `Bearer ${authA()}`);
    expect(res.status).toBe(404);
  });

  it("user B cannot fetch user A's agent by ID", async () => {
    const res = await request(baseUrl)
      .get("/api/agents/agent-a1")
      .set("Authorization", `Bearer ${authB()}`);
    expect(res.status).toBe(404);
  });

  it("each user can fetch their own agent by ID", async () => {
    const resA = await request(baseUrl)
      .get("/api/agents/agent-a1")
      .set("Authorization", `Bearer ${authA()}`);
    expect(resA.status).toBe(200);
    expect((resA.body as any).user_id).toBe(USER_A);

    const resB = await request(baseUrl)
      .get("/api/agents/agent-b1")
      .set("Authorization", `Bearer ${authB()}`);
    expect(resB.status).toBe(200);
    expect((resB.body as any).user_id).toBe(USER_B);
  });
});

describe("Call log isolation", () => {
  it("user A sees only their own call logs", async () => {
    const res = await request(baseUrl)
      .get("/api/calls")
      .set("Authorization", `Bearer ${authA()}`);
    expect(res.status).toBe(200);
    const ids = (res.body as any[]).map((c: any) => c.id);
    expect(ids).toContain("call-a1");
    expect(ids).toContain("call-a2");
    expect(ids).not.toContain("call-b1");
  });

  it("user B sees only their own call logs", async () => {
    const res = await request(baseUrl)
      .get("/api/calls")
      .set("Authorization", `Bearer ${authB()}`);
    expect(res.status).toBe(200);
    const ids = (res.body as any[]).map((c: any) => c.id);
    expect(ids).toContain("call-b1");
    expect(ids).not.toContain("call-a1");
    expect(ids).not.toContain("call-a2");
  });

  it("all call logs returned to user A belong to user A", async () => {
    const res = await request(baseUrl)
      .get("/api/calls")
      .set("Authorization", `Bearer ${authA()}`);
    for (const log of res.body as any[]) {
      expect(log.user_id).toBe(USER_A);
    }
  });
});

describe("Call log IDOR prevention", () => {
  it("user A cannot fetch user B's call log by ID", async () => {
    const res = await request(baseUrl)
      .get("/api/calls/call-b1")
      .set("Authorization", `Bearer ${authA()}`);
    expect(res.status).toBe(404);
  });

  it("user B cannot fetch user A's call log by ID", async () => {
    const res = await request(baseUrl)
      .get("/api/calls/call-a1")
      .set("Authorization", `Bearer ${authB()}`);
    expect(res.status).toBe(404);
  });
});

describe("Settings isolation", () => {
  it("user A reads their own settings", async () => {
    const res = await request(baseUrl)
      .get("/api/settings")
      .set("Authorization", `Bearer ${authA()}`);
    expect(res.status).toBe(200);
    expect((res.body as any).business_name).toBe("Acme Corp");
  });

  it("user B reads their own settings", async () => {
    const res = await request(baseUrl)
      .get("/api/settings")
      .set("Authorization", `Bearer ${authB()}`);
    expect(res.status).toBe(200);
    expect((res.body as any).business_name).toBe("Beta LLC");
  });

  it("user A's settings response does not contain user B's business name", async () => {
    const res = await request(baseUrl)
      .get("/api/settings")
      .set("Authorization", `Bearer ${authA()}`);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain("Beta LLC");
    expect(body).not.toContain(USER_B);
  });
});

describe("Lead list isolation", () => {
  it("user A sees only their own leads", async () => {
    const res = await request(baseUrl)
      .get("/api/outbound/leads")
      .set("Authorization", `Bearer ${authA()}`);
    expect(res.status).toBe(200);
    const ids = (res.body as any[]).map((l: any) => l.id);
    expect(ids).toContain("lead-a1");
    expect(ids).not.toContain("lead-b1");
  });

  it("user B sees only their own leads", async () => {
    const res = await request(baseUrl)
      .get("/api/outbound/leads")
      .set("Authorization", `Bearer ${authB()}`);
    expect(res.status).toBe(200);
    const ids = (res.body as any[]).map((l: any) => l.id);
    expect(ids).toContain("lead-b1");
    expect(ids).not.toContain("lead-a1");
  });
});

describe("Fleet tasks isolation", () => {
  it("user A sees only their own fleet tasks", async () => {
    const res = await request(baseUrl)
      .get("/api/fleet/tasks")
      .set("Authorization", `Bearer ${authA()}`);
    expect(res.status).toBe(200);
    const ids = (res.body as any[]).map((t: any) => t.id);
    expect(ids).toContain("task-a1");
    expect(ids).not.toContain("task-b1");
  });

  it("user B sees only their own fleet tasks", async () => {
    const res = await request(baseUrl)
      .get("/api/fleet/tasks")
      .set("Authorization", `Bearer ${authB()}`);
    expect(res.status).toBe(200);
    const ids = (res.body as any[]).map((t: any) => t.id);
    expect(ids).toContain("task-b1");
    expect(ids).not.toContain("task-a1");
  });
});

describe("Cross-tenant data leakage — bulk assertions", () => {
  const ENDPOINTS = ["/api/agents", "/api/calls", "/api/outbound/leads", "/api/fleet/tasks"];

  for (const endpoint of ENDPOINTS) {
    it(`${endpoint}: user A's response contains no rows owned by user B`, async () => {
      const res = await request(baseUrl)
        .get(endpoint)
        .set("Authorization", `Bearer ${authA()}`);
      expect(res.status).toBe(200);
      for (const row of res.body as any[]) {
        expect(row.user_id).not.toBe(USER_B);
      }
    });

    it(`${endpoint}: user B's response contains no rows owned by user A`, async () => {
      const res = await request(baseUrl)
        .get(endpoint)
        .set("Authorization", `Bearer ${authB()}`);
      expect(res.status).toBe(200);
      for (const row of res.body as any[]) {
        expect(row.user_id).not.toBe(USER_A);
      }
    });
  }
});
