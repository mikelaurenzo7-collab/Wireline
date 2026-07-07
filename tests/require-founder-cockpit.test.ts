import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { requireFounderCockpit } from "../src/middleware/require-founder-cockpit";
import { resetFounderCockpitAccessCacheForTests } from "../src/lib/founder-cockpit-access";
import { resetOwnerEmailCacheForTests } from "../src/lib/platform-owner-emails";

describe("requireFounderCockpit", () => {
  beforeEach(() => {
    resetOwnerEmailCacheForTests();
    resetFounderCockpitAccessCacheForTests();
    process.env.OWNER_EMAIL = "founder@trywireline.com";
  });

  afterEach(() => {
    delete process.env.OWNER_EMAIL;
    resetOwnerEmailCacheForTests();
    resetFounderCockpitAccessCacheForTests();
  });

  function runMiddleware(user: { id: string; email: string } | undefined) {
    const req = {
      user,
      method: "GET",
      path: "/api/founder/cockpit",
      ip: "127.0.0.1",
      get: () => "",
    } as Request;
    const res = {} as Response;
    const next = vi.fn() as unknown as NextFunction;
    requireFounderCockpit(req, res, next);
    return next as ReturnType<typeof vi.fn>;
  }

  it("allows approved founder operators", () => {
    const next = runMiddleware({ id: "u1", email: "founder@trywireline.com" });
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects tenant customers even when authenticated", () => {
    const next = runMiddleware({ id: "u2", email: "customer@example.com" });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]?.statusCode ?? next.mock.calls[0][0]?.httpStatus).toBeTruthy();
  });

  it("rejects unauthenticated requests", () => {
    const next = runMiddleware(undefined);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
