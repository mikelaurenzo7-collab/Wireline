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
    for (const m of [
      "from",
      "where",
      "orderBy",
      "limit",
      "values",
      "onConflictDoNothing",
      "returning",
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
  };
  return {
    queue,
    drizzle,
    dncImportLimitError: vi.fn(() => null),
    evaluateOutboundConsent: vi.fn(),
    getConsentRuleForPhone: vi.fn(() => ({ rule: "default", state: "CA" })),
  };
});

vi.mock("../lib/server-context", () => ({
  drizzle: h.drizzle,
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  auditLogger: { logDnc: vi.fn().mockResolvedValue(undefined) },
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
  tcpaRateLimit: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../lib/tcpa-consent", () => ({
  evaluateOutboundConsent: h.evaluateOutboundConsent,
  getConsentRuleForPhone: h.getConsentRuleForPhone,
  CONSENT_RULE_VERSION: "test-v1",
}));

vi.mock("../lib/dnc-import-limits", () => ({
  DNC_IMPORT_MAX_ENTRIES: 1000,
  DNC_LIST_MAX_ENTRIES: 5000,
  dncImportLimitError: h.dncImportLimitError,
}));

vi.mock("../lib/compliance", () => ({
  normalizeDncPhone: (p: string) => (p || "").replace(/[^\d+]/g, ""),
}));

// POST /dnc dynamically imports the sentinel service on a successful add.
vi.mock("../services/sentinel", () => ({
  SentinelService: class {
    async terminateActiveCallsForNumber() {
      return undefined;
    }
  },
}));

import complianceRouter from "./compliance-routes";

function buildApp() {
  const app = express();
  app.use(express.json());
  mountRouteTestRequestContext(app);
  app.use(complianceRouter);
  return finalizeRouteTestApp(app);
}

const auth = (r: request.Test) => r.set("Authorization", "Bearer test");

beforeEach(() => {
  vi.clearAllMocks();
  h.queue.length = 0;
  h.dncImportLimitError.mockReturnValue(null);
  h.getConsentRuleForPhone.mockReturnValue({ rule: "default", state: "CA" });
});

describe("GET /dnc", () => {
  it("returns DNC entries in snake_case", async () => {
    h.queue.push([
      {
        id: "1",
        phone: "+15551230001",
        phoneRaw: "(555) 123-0001",
        reason: "req",
        source: "manual",
        createdAt: "2026-01-01",
      },
    ]);
    const res = await auth(request(buildApp()).get("/dnc"));
    expect(res.status).toBe(200);
    expect(res.body.entries[0].phone_raw).toBe("(555) 123-0001");
  });
});

describe("POST /dnc", () => {
  it("400s an empty entries array (and isn't masked as 500)", async () => {
    const res = await auth(request(buildApp()).post("/dnc")).send({ entries: [] });
    expect(res.status).toBe(400);
    expect(h.drizzle.insert).not.toHaveBeenCalled();
  });

  it("400s when the import exceeds the max", async () => {
    h.dncImportLimitError.mockReturnValue("Too many entries");
    const res = await auth(request(buildApp()).post("/dnc")).send({
      entries: [{ phone: "+15551230002" }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Too many entries");
  });

  it("adds valid numbers and reports the count", async () => {
    h.queue.push([{ id: "10" }]); // insert().returning()
    const res = await auth(request(buildApp()).post("/dnc")).send({
      entries: [{ phone: "+1 (555) 123-0003", reason: "spam" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.added).toBe(1);
    expect(h.drizzle.insert).toHaveBeenCalled();
  });
});

describe("DELETE /dnc/:id", () => {
  it("404s when the entry isn't found (and isn't masked as 500)", async () => {
    h.queue.push([]); // delete().returning() → nothing removed
    const res = await auth(request(buildApp()).delete("/dnc/999"));
    expect(res.status).toBe(404);
  });

  it("removes an owned entry", async () => {
    h.queue.push([{ id: "5" }]);
    const res = await auth(request(buildApp()).delete("/dnc/5"));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("GET /tcpa/consent-check", () => {
  it("400s a missing phone (and isn't masked as 500)", async () => {
    const res = await auth(request(buildApp()).get("/tcpa/consent-check"));
    expect(res.status).toBe(400);
  });

  it("returns the consent decision for a phone", async () => {
    h.queue.push([]); // dnc lookup — not listed
    h.queue.push([{ businessName: "Acme" }]); // settings
    h.evaluateOutboundConsent.mockReturnValue({ allowed: true, abort_reason: null });
    const res = await auth(
      request(buildApp()).get("/tcpa/consent-check?phone=%2B14155551234&is_marketing=true"),
    );
    expect(res.status).toBe(200);
    expect(res.body.allowed).toBe(true);
    expect(res.body.consent_rule_version).toBe("test-v1");
    expect(h.evaluateOutboundConsent).toHaveBeenCalledWith(
      expect.objectContaining({ is_internal_dnc: false, is_marketing_call: true }),
    );
  });
});
