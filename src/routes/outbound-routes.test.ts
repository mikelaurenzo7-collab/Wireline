import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountRouteTestRequestContext,
  finalizeRouteTestApp,
} from "../../tests/helpers/express-test-app";

// Per-test mutable queue: each terminal `await`/`.returning()` on the drizzle
// builder shifts the next scripted result off the front (mirrors the pattern in
// mobile-routes.test.ts / billing-routes.test.ts).
const h = vi.hoisted(() => {
  const queue: unknown[] = [];
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    const passthrough = () => builder;
    for (const m of [
      "from",
      "where",
      "orderBy",
      "limit",
      "offset",
      "values",
      "returning",
      "onConflictDoUpdate",
      "set",
    ]) {
      builder[m] = passthrough;
    }
    (builder as { then: unknown }).then = (
      resolve: (v: unknown) => unknown,
      reject: (e: unknown) => unknown,
    ) => Promise.resolve(queue.length ? queue.shift() : []).then(resolve, reject);
    return builder;
  };
  const drizzle = {
    select: vi.fn(() => makeBuilder()),
    insert: vi.fn(() => makeBuilder()),
    delete: vi.fn(() => makeBuilder()),
    update: vi.fn(() => makeBuilder()),
  };
  return {
    queue,
    drizzle,
    isDncBlocked: vi.fn(),
    evaluateOutboundConsent: vi.fn(),
    placeOutboundCall: vi.fn(),
    parseFormData: vi.fn(),
  };
});

vi.mock("../lib/server-context", () => ({
  drizzle: h.drizzle,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../middleware/auth", () => ({
  authenticateUser: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { user: { id: string; email: string } }).user = {
      id: "user-1",
      email: "mike@example.com",
    };
    next();
  },
}));

// Gates/limiters are infra we don't exercise here — passthrough.
vi.mock("../middleware/api-rate-limits", () => ({
  claudeRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/voice-spend-control", () => ({
  outboundVoiceGuard: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../middleware/input-validation", () => ({
  validate: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/compliance", () => ({ isDncBlocked: h.isDncBlocked }));
vi.mock("../lib/tcpa-consent", () => ({ evaluateOutboundConsent: h.evaluateOutboundConsent }));
vi.mock("../lib/vapi-client", () => ({ placeOutboundCall: h.placeOutboundCall }));
vi.mock("../lib/form-validators", () => ({
  parseFormData: h.parseFormData,
  OutboundBulkSchema: {},
}));
vi.mock("../lib/sentry-events", () => ({
  SentryEvents: { outboundDialStarted: vi.fn(), outboundLeadsImported: vi.fn() },
}));

import outboundRouter from "./outbound-routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  mountRouteTestRequestContext(app);
  app.use(outboundRouter);
  return finalizeRouteTestApp(app);
}

const auth = (r: request.Test) => r.set("Authorization", "Bearer test");

beforeEach(() => {
  vi.clearAllMocks();
  h.queue.length = 0;
  h.isDncBlocked.mockResolvedValue(false);
  h.evaluateOutboundConsent.mockReturnValue({ allowed: true });
  h.placeOutboundCall.mockResolvedValue({ ok: true, status: 200, callId: "call_123" });
});

describe("GET /api/outbound", () => {
  it("returns leads in snake_case with pagination metadata", async () => {
    h.queue.push([{ count: 2 }]);
    h.queue.push([
      { id: "1", customerName: "Acme Co", customerNumber: "+15551230001", status: "Dialing" },
    ]);
    const res = await auth(request(buildApp()).get("/api/outbound?limit=1&offset=0"));
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.hasMore).toBe(true); // offset 0 + limit 1 < 2
    expect(res.body.leads[0].customer_name).toBe("Acme Co");
  });
});

describe("DELETE /api/outbound/:id", () => {
  it("404s a non-numeric id without hitting the DB", async () => {
    const res = await auth(request(buildApp()).delete("/api/outbound/not-a-number"));
    expect(res.status).toBe(404);
    expect(h.drizzle.delete).not.toHaveBeenCalled();
  });

  it("deletes a lead by numeric id", async () => {
    const res = await auth(request(buildApp()).delete("/api/outbound/42"));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(h.drizzle.delete).toHaveBeenCalled();
  });
});

describe("POST /api/outbound/dial — compliance gates", () => {
  const body = { agentId: "agent-1", customerNumber: "+15551230002", customerName: "Lead" };

  it("blocks a DNC-listed number with 403 (and never places the call)", async () => {
    h.isDncBlocked.mockResolvedValue(true);
    const res = await auth(request(buildApp()).post("/api/outbound/dial")).send(body);
    expect(res.status).toBe(403);
    expect(res.body.dncBlocked).toBe(true);
    expect(h.placeOutboundCall).not.toHaveBeenCalled();
  });

  it("blocks on the TCPA consent gate with 403", async () => {
    h.evaluateOutboundConsent.mockReturnValue({
      allowed: false,
      abort_reason: "no_consent",
      disclosure_script: "Consent required.",
    });
    const res = await auth(request(buildApp()).post("/api/outbound/dial")).send(body);
    expect(res.status).toBe(403);
    expect(res.body.tcpaBlocked).toBe(true);
    expect(h.placeOutboundCall).not.toHaveBeenCalled();
  });

  it("places the call and records the lead when compliance passes", async () => {
    const res = await auth(request(buildApp()).post("/api/outbound/dial")).send(body);
    expect(res.status).toBe(200);
    expect(res.body.callId).toBe("call_123");
    expect(h.placeOutboundCall).toHaveBeenCalledOnce();
    expect(h.drizzle.insert).toHaveBeenCalled(); // lead persisted
  });
});

describe("POST /api/outbound/bulk", () => {
  it("rejects import for an inactive billing plan with 403", async () => {
    h.parseFormData.mockReturnValue({
      success: true,
      data: { leads: [{ customer_number: "+15551230003" }], has_express_written_consent: false },
    });
    h.queue.push([{ subscriptionStatus: "trialing" }]); // settings lookup
    const res = await auth(request(buildApp()).post("/api/outbound/bulk")).send({ leads: [] });
    expect(res.status).toBe(403);
    expect(h.drizzle.insert).not.toHaveBeenCalled();
  });
});
