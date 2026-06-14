import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountRouteTestRequestContext,
  finalizeRouteTestApp,
} from "../../tests/helpers/express-test-app";

// Shared, per-test mutable queue: each terminal `await` on the drizzle builder
// shifts the next result off the front. Lets us script multi-query handlers.
const h = vi.hoisted(() => {
  const queue: unknown[] = [];
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    const passthrough = () => builder;
    for (const m of [
      "from",
      "leftJoin",
      "where",
      "orderBy",
      "limit",
      "values",
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
    select: () => makeBuilder(),
    insert: () => makeBuilder(),
    delete: () => makeBuilder(),
    update: () => makeBuilder(),
  };
  return { queue, drizzle };
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

// Rate limiters + spend guard are infra we don't exercise here — passthrough.
vi.mock("../middleware/api-rate-limits", () => ({
  createRateLimiter: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../lib/voice-spend-control", () => ({
  outboundVoiceGuard: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const placeOutboundCall = vi.fn();
const transferLiveCall = vi.fn();
vi.mock("../lib/vapi-client", () => ({
  placeOutboundCall: (...a: unknown[]) => placeOutboundCall(...a),
  transferLiveCall: (...a: unknown[]) => transferLiveCall(...a),
}));

const isDncBlocked = vi.fn(async () => false);
vi.mock("../lib/compliance", () => ({ isDncBlocked: (...a: unknown[]) => isDncBlocked(...a) }));

const evaluateOutboundConsent = vi.fn(() => ({ allowed: true }));
vi.mock("../lib/tcpa-consent", () => ({
  evaluateOutboundConsent: (...a: unknown[]) => evaluateOutboundConsent(...a),
}));

vi.mock("../lib/auth-service", () => ({ isOwnerEmail: vi.fn(() => false) }));

import mobileRouter from "./mobile-routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  mountRouteTestRequestContext(app);
  app.use(mobileRouter);
  return finalizeRouteTestApp(app);
}

describe("mobile-routes", () => {
  const app = buildApp();

  beforeEach(() => {
    vi.clearAllMocks();
    h.queue.length = 0;
    isDncBlocked.mockResolvedValue(false);
    evaluateOutboundConsent.mockReturnValue({ allowed: true });
  });

  describe("GET /api/mobile/me", () => {
    it("returns a personal workspace with per-agent entitlement math", async () => {
      h.queue.push(
        [{ fullName: "Mike", email: "mike@example.com" }],
        [
          {
            planId: "personal",
            subscriptionStatus: "active",
            maxAgents: 1,
            extraAgents: 1,
            businessName: null,
          },
        ],
        [{ count: 1 }],
      );

      const res = await request(app).get("/api/mobile/me");
      expect(res.status).toBe(200);
      expect(res.body.account.mode).toBe("personal");
      expect(res.body.account.plan_id).toBe("personal");
      // 1 included + 1 purchased extra = cap 2; 1 in use → can still add more.
      expect(res.body.agents).toMatchObject({
        count: 1,
        included: 1,
        extras: 1,
        effective_cap: 2,
        can_add_more: true,
      });
    });
  });

  describe("GET /api/mobile/agents", () => {
    it("returns the user's agent roster", async () => {
      h.queue.push([{ id: "agent-1", name: "Ava", role: "customer_service", channels: ["voice"] }]);
      const res = await request(app).get("/api/mobile/agents");
      expect(res.status).toBe(200);
      expect(res.body.agents).toHaveLength(1);
      expect(res.body.agents[0].name).toBe("Ava");
    });
  });

  describe("POST /api/mobile/devices", () => {
    it("registers a device with a valid body", async () => {
      h.queue.push(undefined); // insert().onConflictDoUpdate()
      const res = await request(app)
        .post("/api/mobile/devices")
        .send({ device_id: "iphone-abc", apns_voip_token: "tok123", platform: "ios" });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true });
    });

    it("rejects a missing device_id with 400", async () => {
      const res = await request(app).post("/api/mobile/devices").send({ platform: "ios" });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/mobile/calls/outbound", () => {
    const body = { agentId: "agent-1", customerNumber: "+15551234567", context: "5 min late" };

    it("rejects an invalid phone number with 400", async () => {
      const res = await request(app)
        .post("/api/mobile/calls/outbound")
        .send({ agentId: "agent-1", customerNumber: "nope" });
      expect(res.status).toBe(400);
      expect(placeOutboundCall).not.toHaveBeenCalled();
    });

    it("blocks a DNC-listed number with 403 before dialing", async () => {
      isDncBlocked.mockResolvedValue(true);
      const res = await request(app).post("/api/mobile/calls/outbound").send(body);
      expect(res.status).toBe(403);
      expect(res.body.dncBlocked).toBe(true);
      expect(placeOutboundCall).not.toHaveBeenCalled();
    });

    it("surfaces a placeOutboundCall failure status", async () => {
      placeOutboundCall.mockResolvedValue({ ok: false, status: 404, error: "Agent not found." });
      const res = await request(app).post("/api/mobile/calls/outbound").send(body);
      expect(res.status).toBe(404);
      expect(res.body.error).toBe("Agent not found.");
    });

    it("dispatches a call and logs the lead on success", async () => {
      placeOutboundCall.mockResolvedValue({ ok: true, callId: "call-1" });
      h.queue.push(undefined); // the outboundLeads insert
      const res = await request(app).post("/api/mobile/calls/outbound").send(body);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ success: true, callId: "call-1" });
      expect(placeOutboundCall).toHaveBeenCalledWith(
        expect.objectContaining({ userId: "user-1", agentId: "agent-1" }),
      );
    });
  });

  describe("GET /api/mobile/calls/active", () => {
    it("returns active call presence rows", async () => {
      h.queue.push([{ callId: "call-1", status: "in-progress", customerNumber: "+15551234567" }]);
      const res = await request(app).get("/api/mobile/calls/active");
      expect(res.status).toBe(200);
      expect(res.body.calls[0].callId).toBe("call-1");
    });
  });

  describe("GET /api/mobile/calls/recent", () => {
    it("stringifies bigint ids and rolls up the follow-up count", async () => {
      h.queue.push([
        { id: 42, summary: "Booked a demo", outcomeTag: "followup", sentiment: "positive" },
        { id: 43, summary: "Wrong number", outcomeTag: "other", sentiment: "neutral" },
      ]);
      const res = await request(app).get("/api/mobile/calls/recent");
      expect(res.status).toBe(200);
      expect(res.body.calls[0].id).toBe("42");
      expect(res.body.needsAttention).toBe(1);
    });
  });

  describe("PUT /api/mobile/settings", () => {
    it("saves a valid callback number", async () => {
      h.queue.push(undefined); // the settings update
      const res = await request(app)
        .put("/api/mobile/settings")
        .send({ handoffPhone: "+15551234567" });
      expect(res.status).toBe(200);
      expect(res.body.handoff_phone).toBe("+15551234567");
    });

    it("rejects a malformed number with 400", async () => {
      const res = await request(app).put("/api/mobile/settings").send({ handoffPhone: "nope" });
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/mobile/calls/:callId/handoff", () => {
    it("404s when the call isn't active for this user", async () => {
      h.queue.push([]); // presence lookup → none
      const res = await request(app).post("/api/mobile/calls/call-1/handoff").send({});
      expect(res.status).toBe(404);
      expect(transferLiveCall).not.toHaveBeenCalled();
    });

    it("409s when the carrier hasn't reported a control URL yet", async () => {
      h.queue.push([{ controlUrl: null }]);
      const res = await request(app).post("/api/mobile/calls/call-1/handoff").send({});
      expect(res.status).toBe(409);
      expect(transferLiveCall).not.toHaveBeenCalled();
    });

    it("transfers the live call to the provided number", async () => {
      h.queue.push([{ controlUrl: "https://x.vapi.ai/control/abc" }]);
      transferLiveCall.mockResolvedValue({ ok: true, status: 200 });
      const res = await request(app)
        .post("/api/mobile/calls/call-1/handoff")
        .send({ to: "+15557654321" });
      expect(res.status).toBe(200);
      expect(transferLiveCall).toHaveBeenCalledWith(
        "https://x.vapi.ai/control/abc",
        "+15557654321",
      );
    });
  });

  describe("GET /api/mobile/calls/:callId/detail", () => {
    it("404s a non-numeric id without touching the DB", async () => {
      const res = await request(app).get("/api/mobile/calls/active/detail");
      expect(res.status).toBe(404);
      expect(h.queue.length).toBe(0); // no query consumed
    });

    it("404s when the call isn't found for this user", async () => {
      h.queue.push([]);
      const res = await request(app).get("/api/mobile/calls/42/detail");
      expect(res.status).toBe(404);
    });

    it("returns the full recap with transcript and a stringified id", async () => {
      h.queue.push([
        { id: 42, summary: "Booked a demo", transcript: "Hi there", sentiment: "positive" },
      ]);
      const res = await request(app).get("/api/mobile/calls/42/detail");
      expect(res.status).toBe(200);
      expect(res.body.call.id).toBe("42");
      expect(res.body.call.transcript).toBe("Hi there");
    });
  });
});
