import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown, next: () => void) => unknown;
const mock = vi.hoisted(() => ({
  routes: new Map<string, Handler[]>(),
  auth: vi.fn(),
  admin: vi.fn(),
  limiter: vi.fn(),
  rateHandler: vi.fn(),
  status: vi.fn(),
}));
vi.mock("express", () => ({
  Router: () => ({
    get: (path: string, ...handlers: Handler[]) => mock.routes.set(`get ${path}`, handlers),
  }),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: mock.auth }));
vi.mock("../src/middleware/platform-admin", () => ({ requirePlatformAdmin: mock.admin }));
vi.mock("../src/middleware/api-rate-limits", () => ({
  createRateLimiter: (config: unknown) => {
    mock.limiter(config);
    return mock.rateHandler;
  },
}));
vi.mock("../src/lib/voice/elevenlabs-readiness", () => ({
  elevenLabsReadinessService: { status: mock.status },
}));
import "../src/routes/elevenlabs-voice-routes";

function request() {
  const req = Object.assign(new EventEmitter(), {
    user: { id: "operator", email: "operator@example.org" },
    aborted: false,
  });
  const res = Object.assign(new EventEmitter(), {
    writableEnded: false,
    destroyed: false,
    setHeader: vi.fn(),
    json: vi.fn(),
  });
  const handlers = mock.routes.get("get /api/voice/elevenlabs/status")!;
  return { req, res, handlers, run: () => handlers.at(-1)!(req, res, vi.fn()) };
}
beforeEach(() => {
  mock.status.mockReset().mockResolvedValue({
    enabled: false,
    configured: true,
    accountCheck: "not_run",
    enrollmentReady: false,
    liveCallsReady: false,
  });
  mock.auth.mockReset();
  mock.admin.mockReset();
  mock.rateHandler.mockReset();
});

describe("operator ElevenLabs status route", () => {
  it("sets no-store before authentication and gates every provider check behind admin and the limiter", () => {
    const { req, res, handlers } = request();
    expect(mock.routes.size).toBe(1);
    const next = vi.fn();
    handlers[0](req, res, next);
    expect(res.setHeader).toHaveBeenCalledExactlyOnceWith("Cache-Control", "no-store");
    expect(next).toHaveBeenCalledOnce();
    expect(handlers.slice(1, -1)).toEqual([mock.auth, mock.admin, mock.rateHandler]);
    expect(mock.limiter).toHaveBeenCalledExactlyOnceWith({
      bucket: "api:elevenlabs-voice-status",
      windowMs: 60_000,
      max: 3,
      failClosedOnError: true,
    });
    expect(mock.status).not.toHaveBeenCalled();
  });

  it.each(["authentication", "admin", "rate limit"])(
    "never reaches the service after a denied %s middleware",
    async (denial) => {
      const { req, res, handlers } = request();
      const gates = [mock.auth, mock.admin, mock.rateHandler];
      for (const gate of gates) gate.mockImplementation((_req, _res, next) => next());
      gates[["authentication", "admin", "rate limit"].indexOf(denial)].mockImplementation(() => {});
      let index = 0;
      const advance = async (): Promise<void> => {
        const handler = handlers[index++];
        if (!handler) return;
        let next: Promise<void> | undefined;
        await handler(req, res, () => {
          next = advance();
        });
        await next;
      };
      await advance();
      expect(mock.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-store");
    },
  );

  it("delegates only the authenticated actor and cancellation signal", async () => {
    const { req, res, run } = request();
    await run();
    expect(mock.status).toHaveBeenCalledExactlyOnceWith(req.user, expect.any(AbortSignal));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ accountCheck: "not_run" }));
    expect(req.listenerCount("aborted")).toBe(0);
    expect(res.listenerCount("close")).toBe(0);
  });

  it.each(["request", "response"])(
    "cancels an account read when the %s disconnects",
    async (side) => {
      const { req, res, run } = request();
      let signal: AbortSignal | undefined;
      mock.status.mockImplementation(async (_actor, received) => {
        signal = received;
        if (side === "request") req.emit("aborted");
        else res.emit("close");
        return { accountCheck: "failed" };
      });
      await run();
      expect(signal?.aborted).toBe(true);
      expect(res.json).not.toHaveBeenCalled();
      expect(req.listenerCount("aborted")).toBe(0);
      expect(res.listenerCount("close")).toBe(0);
    },
  );

  it("marks an already-disconnected request as cancelled before the service runs", async () => {
    const { req, res, run } = request();
    req.aborted = true;
    await run();
    const signal = mock.status.mock.calls[0][1] as AbortSignal;
    expect(signal.aborted).toBe(true);
    expect(res.json).not.toHaveBeenCalled();
  });

  it("does not treat a normally completed response as cancellation", async () => {
    const { res, run } = request();
    let signal: AbortSignal | undefined;
    mock.status.mockImplementation(async (_actor, received) => {
      signal = received;
      res.writableEnded = true;
      res.emit("close");
      return { accountCheck: "not_run" };
    });
    await run();
    expect(signal?.aborted).toBe(false);
    expect(res.json).not.toHaveBeenCalled();
  });

  it("removes disconnect listeners even if authorization or service work rejects", async () => {
    const { req, res, run } = request();
    mock.status.mockRejectedValue(new Error("operator check failed"));
    await expect(run()).rejects.toThrow("operator check failed");
    expect(req.listenerCount("aborted")).toBe(0);
    expect(res.listenerCount("close")).toBe(0);
    expect(res.json).not.toHaveBeenCalled();
  });
});
