import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimit, setRateLimitStore, type RateLimitStore } from "./rateLimit";

describe("rateLimit middleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit and blocks once exceeded", async () => {
    // Reset to a fresh in-memory store per test by setting a new instance.
    const store: RateLimitStore = {
      hit: vi
        .fn()
        .mockResolvedValueOnce({ count: 1, resetsAt: Date.now() + 1000 })
        .mockResolvedValueOnce({ count: 2, resetsAt: Date.now() + 1000 })
        .mockResolvedValueOnce({ count: 3, resetsAt: Date.now() + 1000 }),
    };
    setRateLimitStore(store);

    const middleware = rateLimit({ max: 2, windowMs: 1000 });

    const callMiddleware = async () => {
      const next = vi.fn();
      const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn() };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await middleware({ ip: "1.2.3.4", path: "/x" } as any, res as any, next);
      return { next, res };
    };

    const first = await callMiddleware();
    expect(first.next).toHaveBeenCalledOnce();

    const second = await callMiddleware();
    expect(second.next).toHaveBeenCalledOnce();

    const third = await callMiddleware();
    expect(third.next).not.toHaveBeenCalled();
    expect(third.res.status).toHaveBeenCalledWith(429);
    expect(third.res.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(Number));
  });
});
