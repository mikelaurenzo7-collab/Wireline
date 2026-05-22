// @vitest-environment node
//
// Route tests for the performance-goals API (/api/goals).
//
// Boots a real Express app with the goals router mounted, mocks
// server-context with a chainable Drizzle stub backed by a FIFO result
// queue, and hits the endpoints via supertest. The progress arithmetic
// itself is exhaustively covered in src/lib/goals.test.ts — here we
// verify routing, auth-gating, validation and response shape.

import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import request from "supertest";

// FIFO queue of query results. Each terminal Drizzle call shifts one
// entry; the route handlers issue queries in a fixed order so tests can
// line the queue up deterministically.
const h = vi.hoisted(() => {
  const queue: any[][] = [];
  const chain: any = {};
  for (const m of [
    "select",
    "from",
    "where",
    "values",
    "insert",
    "delete",
    "onConflictDoUpdate",
    "returning",
  ]) {
    chain[m] = () => chain;
  }
  // Makes the chain a thenable — awaiting any query shifts the queue.
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve(queue.shift() ?? []).then(resolve, reject);
  return { queue, drizzle: chain };
});

vi.mock("../../lib/server-context", () => ({
  drizzle: h.drizzle,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../middleware/auth", () => ({
  authenticateUser: (req: any, res: any, next: any) => {
    const uid = req.headers["x-test-user-id"];
    if (!uid) return res.status(401).json({ error: "unauthorized" });
    req.user = { id: uid };
    next();
  },
}));

const USER = "00000000-0000-0000-0000-000000000001";
const GOAL_ID = "11111111-1111-1111-1111-111111111111";

async function makeApp() {
  const router = (await import("../goals-routes")).default;
  const app = express();
  app.use(express.json());
  app.use("/api/goals", router);
  return app;
}

function goalRow(over: Record<string, unknown> = {}) {
  return {
    id: GOAL_ID,
    userId: USER,
    metric: "calls_handled",
    target: 100,
    label: null,
    createdAt: new Date("2026-05-01T00:00:00Z"),
    updatedAt: new Date("2026-05-10T00:00:00Z"),
    ...over,
  };
}

describe("GET /api/goals", () => {
  beforeEach(() => {
    h.queue.length = 0;
  });

  it("401s without an authenticated user", async () => {
    const app = await makeApp();
    const res = await request(app).get("/api/goals");
    expect(res.status).toBe(401);
  });

  it("returns the metric catalog, live actuals and computed goals", async () => {
    // Query order: goals list, then call logs, then appointment count.
    h.queue.push(
      [goalRow({ metric: "calls_handled", target: 100 })],
      [
        { durationSeconds: 120, leadScore: 60 },
        { durationSeconds: 60, leadScore: 10 },
      ],
      [{ count: "3" }],
    );

    const app = await makeApp();
    const res = await request(app).get("/api/goals").set("x-test-user-id", USER);

    expect(res.status).toBe(200);
    expect(res.body.metrics).toHaveLength(4);
    // computeActuals: 2 calls, 1 qualified (score >= 50), 3 min talk time.
    expect(res.body.actuals).toEqual({
      calls_handled: 2,
      appointments_booked: 3,
      qualified_leads: 1,
      voice_minutes: 3,
    });
    expect(res.body.goals).toHaveLength(1);
    expect(res.body.goals[0]).toMatchObject({
      metric: "calls_handled",
      metric_label: "Calls handled",
      target: 100,
      actual: 2,
    });
    expect(res.body.period).toMatch(/^\d{4}-\d{2}$/);
  });

  it("drops rows with an unknown metric", async () => {
    h.queue.push(
      [goalRow({ metric: "calls_handled" }), goalRow({ id: "x", metric: "legacy_metric" })],
      [],
      [{ count: "0" }],
    );
    const app = await makeApp();
    const res = await request(app).get("/api/goals").set("x-test-user-id", USER);
    expect(res.status).toBe(200);
    expect(res.body.goals).toHaveLength(1);
    expect(res.body.goals[0].metric).toBe("calls_handled");
  });
});

describe("POST /api/goals", () => {
  beforeEach(() => {
    h.queue.length = 0;
  });

  it("401s without an authenticated user", async () => {
    const app = await makeApp();
    const res = await request(app).post("/api/goals").send({ metric: "calls_handled", target: 50 });
    expect(res.status).toBe(401);
  });

  it("rejects an unknown metric", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/goals")
      .set("x-test-user-id", USER)
      .send({ metric: "revenue", target: 50 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/metric/i);
  });

  it("rejects a non-positive target", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/goals")
      .set("x-test-user-id", USER)
      .send({ metric: "calls_handled", target: 0 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/target/i);
  });

  it("upserts a goal and returns it with progress", async () => {
    // Query order: insert..returning, then call logs, then appointment count.
    h.queue.push(
      [goalRow({ metric: "appointments_booked", target: 40, label: "Q2 push" })],
      [],
      [{ count: "12" }],
    );
    const app = await makeApp();
    const res = await request(app)
      .post("/api/goals")
      .set("x-test-user-id", USER)
      .send({ metric: "appointments_booked", target: 40, label: "  Q2 push  " });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.goal).toMatchObject({
      metric: "appointments_booked",
      target: 40,
      label: "Q2 push",
      actual: 12,
    });
  });
});

describe("DELETE /api/goals/:id", () => {
  beforeEach(() => {
    h.queue.length = 0;
  });

  it("rejects a malformed id", async () => {
    const app = await makeApp();
    const res = await request(app).delete("/api/goals/not-a-uuid").set("x-test-user-id", USER);
    expect(res.status).toBe(400);
  });

  it("404s when the goal does not exist or belongs to another tenant", async () => {
    h.queue.push([]);
    const app = await makeApp();
    const res = await request(app).delete(`/api/goals/${GOAL_ID}`).set("x-test-user-id", USER);
    expect(res.status).toBe(404);
  });

  it("deletes a goal owned by the tenant", async () => {
    h.queue.push([{ id: GOAL_ID }]);
    const app = await makeApp();
    const res = await request(app).delete(`/api/goals/${GOAL_ID}`).set("x-test-user-id", USER);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
