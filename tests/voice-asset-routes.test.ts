import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const mock = vi.hoisted(() => ({
  routes: new Map<string, unknown[]>(),
  auth: vi.fn(),
  limiter: vi.fn(),
  admin: vi.fn(),
  service: {
    capabilities: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    review: vi.fn(),
    remove: vi.fn(),
    preview: vi.fn(),
  },
}));
vi.mock("express", () => ({
  Router: () =>
    Object.fromEntries(
      ["get", "post", "delete"].map((method) => [
        method,
        (path: string, ...handlers: unknown[]) => mock.routes.set(`${method} ${path}`, handlers),
      ]),
    ),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: mock.auth }));
vi.mock("../src/middleware/platform-admin", () => ({ requirePlatformAdmin: mock.admin }));
vi.mock("../src/middleware/api-rate-limits", () => ({
  createRateLimiter: (config: unknown) => {
    mock.limiter(config);
    return vi.fn();
  },
}));
vi.mock("../src/lib/voice/voice-asset-service", () => ({ voiceAssetService: mock.service }));
import { requirePilotOrCustomerAccess } from "../src/routes/voice-asset-routes";

function request(method: string, path: string) {
  const req = Object.assign(new EventEmitter(), {
    user: { id: "owner", email: "owner@example.org" },
    params: { assetId: "asset-id" },
    body: { expectedVersion: 2, expectedReserveUsd: 0.125 },
  });
  const res = Object.assign(new EventEmitter(), {
    writableEnded: false,
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
    send: vi.fn(),
  });
  const handlers = mock.routes.get(`${method} ${path}`)!;
  return { req, res, handlers, run: () => (handlers.at(-1) as Handler)(req, res) };
}
beforeEach(() => {
  for (const fn of Object.values(mock.service)) fn.mockReset().mockResolvedValue({});
});
afterEach(() => vi.unstubAllEnvs());

describe("private voice asset HTTP routes", () => {
  it("authenticates and rate limits every route while the service owns lane authorization", () => {
    expect(mock.routes.size).toBe(6);
    for (const [path, handlers] of mock.routes) {
      expect(handlers[0]).toBe(mock.auth);
      expect(typeof handlers[1]).toBe("function");
      if (path.includes("capabilities")) {
        expect(handlers).toHaveLength(3);
      } else {
        // The pilot's audited admin middleware stays in the chain; when the
        // customer flag is on the gateway defers to the service instead.
        expect(handlers).toHaveLength(4);
        expect(handlers[2]).toBe(requirePilotOrCustomerAccess);
      }
    }
    expect(mock.limiter).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "api:voice-assets-preview",
        max: 3,
        failClosedOnError: true,
      }),
    );
    expect(mock.limiter).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "api:voice-assets-write",
        max: 8,
        failClosedOnError: true,
      }),
    );
    expect(mock.limiter).toHaveBeenCalledWith(
      expect.objectContaining({ bucket: "api:voice-assets-read", max: 20 }),
    );
  });

  it("keeps the audited platform-admin gate on the admin pilot path while the customer flag is off", () => {
    vi.stubEnv("VOICE_CLONE_CUSTOMER_ENABLED", "false");
    const req = {} as never;
    const res = {} as never;
    const next = vi.fn();
    mock.admin.mockImplementation((_req: unknown, _res: unknown, forward: () => void) => forward());
    requirePilotOrCustomerAccess(req, res, next);
    expect(mock.admin).toHaveBeenCalledWith(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("defers operation authorization to the service when the customer canary is on", () => {
    vi.stubEnv("VOICE_CLONE_CUSTOMER_ENABLED", "true");
    const req = {} as never;
    const res = {} as never;
    const next = vi.fn();
    mock.admin.mockClear();
    requirePilotOrCustomerAccess(req, res, next);
    expect(mock.admin).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns closed capability responses without caching", async () => {
    mock.service.capabilities.mockResolvedValue({ available: false });
    const { run, req, res } = request("get", "/api/voice/assets/capabilities");
    await run();
    expect(mock.service.capabilities).toHaveBeenCalledWith(req.user);
    expect(res.json).toHaveBeenCalledWith({ available: false });
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
  });
  it.each([
    ["get", "/api/voice/assets", "list"],
    ["post", "/api/voice/assets", "create"],
    ["post", "/api/voice/assets/:assetId/review", "review"],
    ["delete", "/api/voice/assets/:assetId", "remove"],
  ] as const)(
    "delegates %s %s with the authenticated actor",
    async (method, path, serviceMethod) => {
      const { run, req, res } = request(method, path);
      await run();
      const expected =
        serviceMethod === "list"
          ? [req.user]
          : serviceMethod === "create"
            ? [req.user, req.body]
            : [req.user, req.params.assetId, req.body];
      expect(mock.service[serviceMethod]).toHaveBeenCalledWith(...expected);
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
      if (serviceMethod === "create") expect(res.status).toHaveBeenCalledWith(201);
    },
  );
  it("sends generated audio privately, exposes the reserve only, and clears its intermediate bytes", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    mock.service.preview.mockResolvedValue({ bytes, reserveUsd: 0.125 });
    const { run, req, res } = request("post", "/api/voice/assets/:assetId/preview");
    await run();
    expect(mock.service.preview).toHaveBeenCalledWith(
      req.user,
      req.params.assetId,
      req.body,
      expect.any(AbortSignal),
    );
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "audio/wav");
    expect(res.setHeader).toHaveBeenCalledWith("X-Voice-Preview-Reserve-Usd", "0.125");
    expect(res.setHeader).toHaveBeenCalledWith("X-Content-Type-Options", "nosniff");
    expect(res.send.mock.calls[0][0]).toEqual(Buffer.from([1, 2, 3]));
    expect(bytes).toEqual(new Uint8Array(3));
    expect(req.listenerCount("aborted")).toBe(0);
    expect(res.listenerCount("close")).toBe(0);
  });
  it("cancels worker requests when the HTTP caller disconnects", async () => {
    const { run, req, res } = request("post", "/api/voice/assets/:assetId/preview");
    let signal: AbortSignal | undefined;
    mock.service.preview.mockImplementation(async (_actor, _id, _body, received) => {
      signal = received;
      req.emit("aborted");
      throw new Error("cancelled");
    });
    await expect(run()).rejects.toThrow("cancelled");
    expect(signal?.aborted).toBe(true);
    expect(res.send).not.toHaveBeenCalled();
    expect(req.listenerCount("aborted")).toBe(0);
  });
  it("clears generated audio even when the response cannot be sent", async () => {
    const bytes = new Uint8Array([1, 2, 3]);
    mock.service.preview.mockResolvedValue({ bytes, reserveUsd: 0.125 });
    const { run, req, res } = request("post", "/api/voice/assets/:assetId/preview");
    res.send.mockImplementation(() => {
      throw new Error("closed response");
    });
    await expect(run()).rejects.toThrow("closed response");
    expect(bytes).toEqual(new Uint8Array(3));
    expect(req.listenerCount("aborted")).toBe(0);
    expect(res.listenerCount("close")).toBe(0);
  });
});
