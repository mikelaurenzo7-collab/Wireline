import type { NextFunction, Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shared mutable state + spies the mocked modules read from. Hoisted so the
// vi.mock factories (which are hoisted to the top of the file) can reference
// them without a TDZ error.
const h = vi.hoisted(() => ({
  state: {
    rows: [] as Array<{ isAdmin: boolean | null }>,
    dbError: null as Error | null,
    owner: "" as string,
  },
  logSecurity: vi.fn(async () => undefined),
}));

// drizzle.select({...}).from().where().limit() resolves to state.rows
// (or rejects with state.dbError to exercise the fail-closed path).
vi.mock("../lib/server-context", () => {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = () =>
    h.state.dbError ? Promise.reject(h.state.dbError) : Promise.resolve(h.state.rows);
  return {
    drizzle: chain,
    log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    auditLogger: { logSecurity: h.logSecurity },
  };
});

vi.mock("../db/schema", () => ({ users: { id: "users.id", isAdmin: "users.isAdmin" } }));
vi.mock("drizzle-orm", () => ({ eq: (l: unknown, r: unknown) => ({ op: "eq", l, r }) }));
vi.mock("../lib/auth-service", () => ({
  isOwnerEmail: (email: string | null | undefined) =>
    !!h.state.owner && !!email && email.trim().toLowerCase() === h.state.owner,
}));

import { isPlatformAdmin, requirePlatformAdmin } from "./platform-admin";

const state = h.state;
const logSecurity = h.logSecurity;

function mockRes() {
  return {} as Response;
}

function mockReq(user?: { id?: string; email?: string }): Request {
  return {
    user,
    method: "POST",
    path: "/api/admin/thing",
    ip: "1.2.3.4",
    get: () => "test-agent",
  } as unknown as Request;
}

beforeEach(() => {
  state.rows = [];
  state.dbError = null;
  state.owner = "";
  vi.clearAllMocks();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("isPlatformAdmin", () => {
  it("returns false when there is no authenticated user", async () => {
    expect(await isPlatformAdmin(undefined)).toBe(false);
    expect(await isPlatformAdmin({ email: "x@y.com" })).toBe(false);
  });

  it("grants the owner email without a DB lookup", async () => {
    state.owner = "founder@trywireline.com";
    // rows intentionally empty — should not be consulted.
    expect(await isPlatformAdmin({ id: "u1", email: "Founder@Trywireline.com" })).toBe(true);
  });

  it("grants a non-owner user whose is_admin flag is true", async () => {
    state.rows = [{ isAdmin: true }];
    expect(await isPlatformAdmin({ id: "u2", email: "staff@trywireline.com" })).toBe(true);
  });

  it("denies a non-owner user whose is_admin flag is false/null", async () => {
    state.rows = [{ isAdmin: false }];
    expect(await isPlatformAdmin({ id: "u3", email: "user@example.com" })).toBe(false);
    state.rows = [{ isAdmin: null }];
    expect(await isPlatformAdmin({ id: "u3", email: "user@example.com" })).toBe(false);
    state.rows = [];
    expect(await isPlatformAdmin({ id: "u3", email: "user@example.com" })).toBe(false);
  });
});

describe("requirePlatformAdmin", () => {
  it("forwards 401 AppError when unauthenticated", async () => {
    const next = vi.fn() as unknown as NextFunction;
    await requirePlatformAdmin(mockReq(undefined), mockRes(), next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.status).toBe(401);
  });

  it("calls next() with no error for an admin", async () => {
    state.rows = [{ isAdmin: true }];
    const next = vi.fn() as unknown as NextFunction;
    await requirePlatformAdmin(mockReq({ id: "u1", email: "a@b.com" }), mockRes(), next);
    expect((next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBeUndefined();
  });

  it("forwards 403 AppError and audits the denial for a non-admin", async () => {
    state.rows = [{ isAdmin: false }];
    const next = vi.fn() as unknown as NextFunction;
    await requirePlatformAdmin(mockReq({ id: "u9", email: "nope@b.com" }), mockRes(), next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.status).toBe(403);
    // Wait a tick for the fire-and-forget audit promise.
    await Promise.resolve();
    expect(logSecurity).toHaveBeenCalledWith(
      "unauthorized_access",
      expect.objectContaining({ userId: "u9", metadata: { scope: "platform_admin" } }),
    );
  });

  it("fails CLOSED with a 500 AppError when the admin lookup throws", async () => {
    state.dbError = new Error("db down");
    const next = vi.fn() as unknown as NextFunction;
    await requirePlatformAdmin(mockReq({ id: "u4", email: "c@d.com" }), mockRes(), next);
    const err = (next as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(err.status).toBe(500);
  });
});
