import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountRouteTestRequestContext,
  mountTestErrorHandler,
} from "../../tests/helpers/express-test-app";

const h = vi.hoisted(() => ({
  approveLesson: vi.fn(async () => true),
  rejectLesson: vi.fn(async () => true),
  getLearningDigest: vi.fn(async () => ({ lessons: [], summary: "all good" })),
}));

vi.mock("../middleware/auth", () => ({
  authenticateUser: vi.fn((req: any, _res: any, next: any) => {
    req.user = { id: "user-1", email: "test@example.com" };
    next();
  }),
}));

vi.mock("../middleware/api-rate-limits", () => ({
  createRateLimiter: vi.fn(() => (_req: any, _res: any, next: any) => next()),
}));

vi.mock("../lib/agent-learning-loop", () => ({
  approveLesson: h.approveLesson,
  rejectLesson: h.rejectLesson,
  getLearningDigest: h.getLearningDigest,
}));

vi.mock("../lib/server-context", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

async function buildApp() {
  const { default: router } = await import("./learning-routes");
  const app = express();
  app.use(express.json());
  mountRouteTestRequestContext(app);
  app.use(router);
  mountTestErrorHandler(app);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  h.approveLesson.mockResolvedValue(true);
  h.rejectLesson.mockResolvedValue(true);
  h.getLearningDigest.mockResolvedValue({ lessons: [], summary: "all good" });
});

describe("POST /api/agents/lessons/review", () => {
  it("approves a lesson and passes lesson_id as a BigInt", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/agents/lessons/review")
      .send({ lesson_id: "42", action: "approve" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(h.approveLesson).toHaveBeenCalledWith(BigInt(42), "user-1");
    expect(h.rejectLesson).not.toHaveBeenCalled();
  });

  it("rejects a lesson via the reject action", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/agents/lessons/review")
      .send({ lesson_id: "7", action: "reject" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(h.rejectLesson).toHaveBeenCalledWith(BigInt(7), "user-1");
    expect(h.approveLesson).not.toHaveBeenCalled();
  });

  it("returns 400 (not 500) for a non-numeric lesson_id", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/agents/lessons/review")
      .send({ lesson_id: "not-a-number", action: "approve" });

    expect(res.status).toBe(400);
    expect(h.approveLesson).not.toHaveBeenCalled();
    expect(h.rejectLesson).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown action", async () => {
    const app = await buildApp();
    const res = await request(app)
      .post("/api/agents/lessons/review")
      .send({ lesson_id: "1", action: "snooze" });

    expect(res.status).toBe(400);
  });

  it("returns 500 when the learning loop throws", async () => {
    h.approveLesson.mockRejectedValueOnce(new Error("db down"));
    const app = await buildApp();
    const res = await request(app)
      .post("/api/agents/lessons/review")
      .send({ lesson_id: "1", action: "approve" });

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });
});

describe("GET /api/agents/:id/learning-digest", () => {
  it("returns the digest for the agent", async () => {
    const app = await buildApp();
    const res = await request(app).get("/api/agents/agent-9/learning-digest");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, digest: { lessons: [], summary: "all good" } });
    expect(h.getLearningDigest).toHaveBeenCalledWith("user-1", "agent-9");
  });

  it("returns 500 when the digest lookup fails", async () => {
    h.getLearningDigest.mockRejectedValueOnce(new Error("boom"));
    const app = await buildApp();
    const res = await request(app).get("/api/agents/agent-9/learning-digest");

    expect(res.status).toBe(500);
    expect(res.body.ok).toBe(false);
  });
});
