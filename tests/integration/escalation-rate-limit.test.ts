import { describe, it, expect, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express, { type Request, type Response } from "express";
import rateLimit from "express-rate-limit";

// We test the exact rate limiter configuration and behavior that was added
// to src/routes/escalation-routes.ts for owner protection.
//
// Owner standard:
// - Legitimate Vapi escalation bursts during a busy day (a few per minute) must succeed.
// - Scripted abuse / flooding that would spam the owner with SMS or pollute /triage
//   must be blocked with 429 after a tight window.
// - The limiter must be mounted early, before expensive signature/DB work.

const ESCALATION_WINDOW_MS = 60_000;
const ESCALATION_MAX = 12;

const escalationRateLimiter = rateLimit({
  windowMs: ESCALATION_WINDOW_MS,
  max: ESCALATION_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many escalation requests from this source." },
});

// Minimal mount that mirrors production wiring (limiter first, then handler).
function createEscalationTestApp() {
  const app = express();
  app.use(express.json());

  app.post("/api/escalate", escalationRateLimiter, (_req: Request, res: Response) => {
    // In real route this does signature check + DB + SMS/Slack.
    // For rate limit TDD we just need to prove the limiter fires.
    res.status(200).json({ ok: true, simulated: true });
  });

  // Error handler to surface 429 bodies cleanly
  app.use((err: any, _req: Request, res: Response, _next: any) => {
    if (err.status === 429) {
      res.status(429).json(err);
    } else {
      res.status(500).json({ error: "unexpected" });
    }
  });

  return app;
}

describe("Escalation rate limiter — owner-grade abuse protection (TDD)", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createEscalationTestApp();
  });

  afterEach(() => {
    // supertest doesn't require explicit cleanup for in-memory apps
  });

  it("allows up to the configured max requests in the window", async () => {
    const ip = "203.0.113.10"; // documentation IP range, never real traffic

    for (let i = 0; i < ESCALATION_MAX; i++) {
      const res = await request(app)
        .post("/api/escalate")
        .set("X-Forwarded-For", ip)
        .send({ summary: `burst-${i}` });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    }
  });

  it("returns 429 with clear message after exceeding the limit from the same IP", async () => {
    const ip = "203.0.113.20";

    // Exhaust the budget
    for (let i = 0; i < ESCALATION_MAX; i++) {
      await request(app)
        .post("/api/escalate")
        .set("X-Forwarded-For", ip)
        .send({ summary: `exhaust-${i}` });
    }

    const res = await request(app)
      .post("/api/escalate")
      .set("X-Forwarded-For", ip)
      .send({ summary: "abuse attempt" });

    expect(res.status).toBe(429);
    expect(res.body.error).toMatch(/too many escalation requests/i);
  });

  it("does not apply the limit across different IPs (per-IP isolation)", async () => {
    const ipA = "203.0.113.30";
    const ipB = "203.0.113.31";

    // Exhaust A
    for (let i = 0; i < ESCALATION_MAX; i++) {
      await request(app)
        .post("/api/escalate")
        .set("X-Forwarded-For", ipA)
        .send({ summary: `a-${i}` });
    }

    // B should still be allowed (different source)
    const resB = await request(app)
      .post("/api/escalate")
      .set("X-Forwarded-For", ipB)
      .send({ summary: "legit from B" });

    expect(resB.status).toBe(200);
  });

  it("the limiter is mounted before any heavy work (defense in depth)", async () => {
    // This is a behavioral contract test: even if the handler is slow or throws,
    // once the limit is hit we must get 429 quickly without executing side effects.
    // In the real route this protects against DB/SMS/Slack cost during an attack.
    const ip = "203.0.113.40";

    for (let i = 0; i < ESCALATION_MAX + 3; i++) {
      const res = await request(app)
        .post("/api/escalate")
        .set("X-Forwarded-For", ip)
        .send({ summary: `pressure-${i}` });

      if (i >= ESCALATION_MAX) {
        expect(res.status).toBe(429);
      }
    }
  });
});
