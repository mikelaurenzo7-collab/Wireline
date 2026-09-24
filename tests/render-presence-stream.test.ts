import express, { type RequestHandler } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  where: vi.fn(),
  register: vi.fn(),
  unregister: vi.fn(),
}));

vi.mock("../src/lib/server-context", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  drizzle: { select: () => ({ from: () => ({ where: mocks.where }) }) },
  serialQueryBatch: vi.fn(),
}));
vi.mock("../src/services/presence-stream-service", () => ({
  presenceStreams: { register: mocks.register, unregister: mocks.unregister },
}));
vi.mock("../src/middleware/auth", () => {
  const authenticate: RequestHandler = (req, _res, next) => {
    Object.assign(req, { user: { id: "presence-tenant" } });
    next();
  };
  return { authenticateUser: authenticate, authenticateEventStream: authenticate };
});
vi.mock("../src/middleware/api-rate-limits", () => ({
  fleetRateLimit: ((_req, _res, next) => next()) satisfies RequestHandler,
}));
vi.mock("../src/lib/api-validation", () => ({
  validateBody: () => ((_req, _res, next) => next()) satisfies RequestHandler,
  updateFollowUpTaskSchema: {},
}));
vi.mock("../src/lib/nav-counts-invalidate", () => ({ touchNavCounts: vi.fn() }));
vi.mock("../src/lib/action-engine", () => ({ executeAction: vi.fn() }));
vi.mock("../src/lib/action-execution-idempotency", () => ({ assertTaskCanBeEdited: vi.fn() }));
vi.mock("../src/lib/product-event-server", () => ({ emitServerProductEventOnce: vi.fn() }));

import fleetRouter from "../src/routes/fleet-routes";

let server: Server;
let url: string;

beforeEach(async () => {
  vi.clearAllMocks();
  for (const key of [
    "RENDER",
    "RENDER_SERVICE_ID",
    "RENDER_GIT_BRANCH",
    "RENDER_GIT_COMMIT",
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_GIT_COMMIT_REF",
    "VERCEL_GIT_COMMIT_SHA",
  ])
    vi.stubEnv(key, "");
  mocks.where.mockResolvedValue([{ id: "signal-1", userId: "presence-tenant", status: "active" }]);
  const app = express();
  app.use(fleetRouter);
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  vi.unstubAllEnvs();
});

describe("managed presence snapshots", () => {
  it.each(["render", "vercel"])(
    "ends the %s snapshot response so EventSource can activate polling",
    async (provider) => {
      vi.stubEnv(provider === "render" ? "RENDER" : "VERCEL", provider === "render" ? "true" : "1");
      const response = await fetch(`${url}/api/Assistants/presence/stream`, {
        signal: AbortSignal.timeout(1_000),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/event-stream");
      // Reading to EOF is the regression check: an open silent stream prevents polling.
      expect(await response.text()).toBe(
        'data: {"type":"presence","signals":[{"id":"signal-1","userId":"presence-tenant","status":"active"}]}\n\n',
      );
      expect(mocks.register).toHaveBeenCalledTimes(1);
      expect(mocks.unregister).toHaveBeenCalledExactlyOnceWith(
        "presence-tenant",
        mocks.register.mock.calls[0][1],
      );
    },
  );
});
