import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
}));

vi.mock("../src/lib/rate-limit", () => ({
  rateLimit: mocks.rateLimit,
  peekRateLimit: vi.fn(),
  distributedLimiterStatus: vi.fn(() => ({ ok: true })),
}));

vi.mock("../src/lib/server-context", () => ({
  auditLogger: { logSecurity: vi.fn().mockResolvedValue(undefined) },
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { recordSigninFailure } from "../src/middleware/rate-limit-middleware";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const allowed = { allowed: true, remaining: 1, resetMs: 60_000 };

beforeEach(() => {
  mocks.rateLimit.mockReset();
});

describe("failed sign-in counter durability", () => {
  it("starts both dimensions together and waits for both remote writes", async () => {
    const ipWrite = deferred<typeof allowed>();
    const emailWrite = deferred<typeof allowed>();
    mocks.rateLimit.mockImplementationOnce(() => ipWrite.promise);
    mocks.rateLimit.mockImplementationOnce(() => emailWrite.promise);

    const recorded = recordSigninFailure("203.0.113.8", "  USER@Example.COM ");
    let settled = false;
    void recorded.then(() => {
      settled = true;
    });

    // Both calls are dispatched before the first await, so neither dimension
    // adds a full network round trip to the failure path.
    expect(mocks.rateLimit).toHaveBeenCalledTimes(2);
    expect(mocks.rateLimit.mock.calls.map(([key]) => key)).toEqual([
      "signin_fail_ip:203.0.113.8",
      "signin_fail_email:user@example.com",
    ]);
    expect(settled).toBe(false);

    ipWrite.resolve(allowed);
    await Promise.resolve();
    expect(settled).toBe(false);

    emailWrite.resolve(allowed);
    await recorded;
    expect(settled).toBe(true);
  });

  it("keeps limiter outages best-effort so callers can preserve the 401", async () => {
    mocks.rateLimit.mockRejectedValueOnce(new Error("redis unavailable"));
    mocks.rateLimit.mockResolvedValueOnce(allowed);

    await expect(recordSigninFailure("203.0.113.9", "user@example.com")).resolves.toBeUndefined();
    expect(mocks.rateLimit).toHaveBeenCalledTimes(2);
  });
});
