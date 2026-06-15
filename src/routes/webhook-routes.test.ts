import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  mountRouteTestRequestContext,
  finalizeRouteTestApp,
} from "../../tests/helpers/express-test-app";

// Per-test mutable queue: each terminal `await`/`.returning()` shifts the next
// scripted result off the front (same pattern as the other route tests).
const h = vi.hoisted(() => {
  const queue: unknown[] = [];
  const makeBuilder = () => {
    const builder: Record<string, unknown> = {};
    const passthrough = () => builder;
    for (const m of ["from", "where", "orderBy", "limit", "set", "values", "returning"]) {
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
    update: vi.fn(() => makeBuilder()),
    delete: vi.fn(() => makeBuilder()),
  };
  return { queue, drizzle, validateWebhookUrl: vi.fn(), dispatchWebhook: vi.fn() };
});

vi.mock("../lib/server-context", () => ({
  drizzle: h.drizzle,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  auditLogger: { logWebhook: vi.fn().mockResolvedValue(undefined) },
  requirePermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
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

vi.mock("../middleware/api-rate-limits", () => ({
  webhooksRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/api-validation", () => ({
  validateBody: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  createWebhookSchema: {},
  updateWebhookSchema: {},
}));

vi.mock("../lib/webhook-validators", () => ({ validateWebhookUrl: h.validateWebhookUrl }));

vi.mock("../lib/webhook-helpers", () => ({
  WEBHOOK_EVENTS: ["task.created", "lead.created"],
  attemptWebhookDelivery: vi.fn().mockResolvedValue(undefined),
  dispatchWebhook: h.dispatchWebhook,
}));

vi.mock("../lib/secret-vault", () => ({
  encryptSecret: (s: string) => `enc:${s}`,
  lastFour: (s: string) => s.slice(-4),
  isVaultConfigured: () => true,
}));

import webhookRouter from "./webhook-routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  mountRouteTestRequestContext(app);
  app.use(webhookRouter);
  return finalizeRouteTestApp(app);
}

const auth = (r: request.Test) => r.set("Authorization", "Bearer test");

beforeEach(() => {
  vi.clearAllMocks();
  h.queue.length = 0;
  h.validateWebhookUrl.mockResolvedValue(null); // url valid by default
  h.dispatchWebhook.mockResolvedValue(undefined);
});

describe("GET /", () => {
  it("lists webhooks + available events", async () => {
    h.queue.push([{ id: "wh1", name: "Hook", url: "https://x.test/h", events: ["task.created"] }]);
    const res = await auth(request(buildApp()).get("/"));
    expect(res.status).toBe(200);
    expect(res.body.webhooks).toHaveLength(1);
    expect(res.body.available_events).toContain("task.created");
  });
});

describe("POST / — validation propagates (not masked as 500)", () => {
  it("400s an unknown event", async () => {
    const res = await auth(request(buildApp()).post("/")).send({
      name: "Hook",
      url: "https://x.test/h",
      events: ["bogus.event"],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Unknown events/);
  });

  it("400s an invalid URL", async () => {
    h.validateWebhookUrl.mockResolvedValue("URL must be https");
    const res = await auth(request(buildApp()).post("/")).send({
      name: "Hook",
      url: "http://insecure",
      events: ["task.created"],
    });
    expect(res.status).toBe(400);
  });
});

describe("PATCH /:id", () => {
  it("404s when the webhook isn't found (not masked as 500)", async () => {
    h.queue.push([]); // update().returning() → nothing updated
    const res = await auth(request(buildApp()).patch("/wh-missing")).send({ name: "x" });
    expect(res.status).toBe(404);
  });
});

describe("POST /:id/test", () => {
  it("404s when the webhook isn't found", async () => {
    h.queue.push([]); // ownership lookup → none
    const res = await auth(request(buildApp()).post("/wh-missing/test"));
    expect(res.status).toBe(404);
    expect(h.dispatchWebhook).not.toHaveBeenCalled();
  });
});

describe("POST /deliveries/:id/retry", () => {
  it("400s a non-numeric delivery id (not masked as 500)", async () => {
    const res = await auth(request(buildApp()).post("/deliveries/not-a-number/retry"));
    expect(res.status).toBe(400);
  });
});
