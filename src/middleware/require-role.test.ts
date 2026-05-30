import type { Request, Response } from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// server-context builds a pg Pool at import; require-role only needs `log`.
vi.mock("../lib/server-context", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import {
  createRbacMiddleware,
  getCallerRole,
  invalidateRoleCache,
  type RbacDeps,
} from "./require-role";

// AuthZ is implemented (and CI guards that every route is wired to a guard
// via authz:check). These tests pin the *runtime behaviour* of the guard so
// a refactor of require-role.ts can't silently weaken 401/403/fail-closed
// semantics while still passing the wiring check.

type RoleRow = { role: string };

/**
 * Minimal Drizzle stand-in: select().from().where().orderBy().limit()
 * resolves to `rows`. If `rows` is an Error it rejects (DB-failure path).
 */
function fakeDrizzle(rows: RoleRow[] | Error) {
  const result = rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows);
  const chain: any = {
    select: () => chain,
    from: () => chain,
    where: () => chain,
    orderBy: () => chain,
    limit: () => result,
  };
  return chain as RbacDeps["drizzle"];
}

function mockReqRes(userId?: string) {
  const req = {
    user: userId ? { id: userId } : undefined,
    ip: "203.0.113.5",
    get: () => "vitest-agent",
  } as unknown as Request;
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  } as unknown as Response & { statusCode: number; body: any };
  return { req, res };
}

const UID = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  invalidateRoleCache(UID);
  vi.clearAllMocks();
});

describe("getCallerRole", () => {
  beforeEach(() => invalidateRoleCache(UID));

  it("returns the team member's role when a row exists", async () => {
    expect(await getCallerRole(fakeDrizzle([{ role: "operator" }]), UID)).toBe("operator");
  });

  it("defaults to owner for single-tenant users with no membership row", async () => {
    expect(await getCallerRole(fakeDrizzle([]), UID)).toBe("owner");
  });

  it("ignores unknown role values and falls back to owner", async () => {
    expect(await getCallerRole(fakeDrizzle([{ role: "superduper" }]), UID)).toBe("owner");
  });

  it("caches within the TTL (second call does not re-query)", async () => {
    const limit = vi.fn().mockResolvedValue([{ role: "admin" }]);
    const chain: any = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit: limit,
    };
    await getCallerRole(chain, UID);
    await getCallerRole(chain, UID);
    expect(limit).toHaveBeenCalledTimes(1);
  });
});

describe("requirePermission", () => {
  const audit = { logSecurity: vi.fn().mockResolvedValue(undefined) };

  it("calls next() when the role holds the permission", async () => {
    invalidateRoleCache(UID);
    const { requirePermission } = createRbacMiddleware({
      drizzle: fakeDrizzle([{ role: "owner" }]),
      auditLogger: audit,
    });
    const { req, res } = mockReqRes(UID);
    const next = vi.fn();
    await requirePermission("quotas.override")(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.statusCode).toBe(0);
  });

  it("returns 401 AUTH_REQUIRED when unauthenticated", async () => {
    const { requirePermission } = createRbacMiddleware({ drizzle: fakeDrizzle([]) });
    const { req, res } = mockReqRes(undefined);
    const next = vi.fn();
    await requirePermission("calls.read")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("AUTH_REQUIRED");
  });

  it("returns 403 FORBIDDEN and audits when the permission is missing", async () => {
    invalidateRoleCache(UID);
    const { requirePermission } = createRbacMiddleware({
      drizzle: fakeDrizzle([{ role: "viewer" }]),
      auditLogger: audit,
    });
    const { req, res } = mockReqRes(UID);
    const next = vi.fn();
    await requirePermission("billing.manage")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(audit.logSecurity).toHaveBeenCalledWith(
      "unauthorized_access",
      expect.objectContaining({ userId: UID, resource: "billing.manage" }),
    );
  });

  it("fails CLOSED (403) when the role lookup throws", async () => {
    invalidateRoleCache(UID);
    const { requirePermission } = createRbacMiddleware({
      drizzle: fakeDrizzle(new Error("db down")),
    });
    const { req, res } = mockReqRes(UID);
    const next = vi.fn();
    await requirePermission("calls.read")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

describe("requireRole", () => {
  it("allows a role at or above the threshold", async () => {
    invalidateRoleCache(UID);
    const { requireRole } = createRbacMiddleware({ drizzle: fakeDrizzle([{ role: "admin" }]) });
    const { req, res } = mockReqRes(UID);
    const next = vi.fn();
    await requireRole("operator")(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("denies a role below the threshold with 403", async () => {
    invalidateRoleCache(UID);
    const { requireRole } = createRbacMiddleware({ drizzle: fakeDrizzle([{ role: "viewer" }]) });
    const { req, res } = mockReqRes(UID);
    const next = vi.fn();
    await requireRole("admin")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
  });

  it("returns 401 when unauthenticated", async () => {
    const { requireRole } = createRbacMiddleware({ drizzle: fakeDrizzle([]) });
    const { req, res } = mockReqRes(undefined);
    const next = vi.fn();
    await requireRole("viewer")(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe("AUTH_REQUIRED");
  });
});
