import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

// server-context builds a pg Pool at import; require-role only needs `log`.
vi.mock("../lib/server-context", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { createRbacMiddleware, getCallerRole, type RbacDeps } from "./require-role";

// AuthZ is implemented (and CI guards that every route is wired to a guard
// via authz:check). These tests pin the *runtime behaviour* of the guard so
// a refactor of require-role.ts can't silently weaken 401/403/fail-closed
// semantics while still passing the wiring check.
//
// IMPORTANT: getCallerRole caches roles in a module-level Map keyed by userId
// for 30s. To keep every test hermetic regardless of execution order or
// parallelism, each test mints a FRESH unique userId (uniqueUid) so no test
// can ever read another's cached entry. This avoids the shared-cache flakiness
// that a single shared UID + invalidate-in-beforeEach is prone to in CI.

type RoleRow = { role: string };

let uidCounter = 0;
/** A fresh, never-before-cached UUID-shaped id for each test. */
function uniqueUid(): string {
  const n = (uidCounter++).toString(16).padStart(12, "0");
  return `11111111-1111-4111-8111-${n}`;
}

/**
 * Minimal Drizzle stand-in: select().from().where().orderBy().limit()
 * resolves to `rows`. If `rows` is an Error it rejects (DB-failure path).
 */
function fakeDrizzle(rows: RoleRow[] | Error) {
  const result = rows instanceof Error ? Promise.reject(rows) : Promise.resolve(rows);
  // Swallow the rejection's "unhandled" warning; the code under test awaits it.
  if (rows instanceof Error) void result.catch(() => {});
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

describe("getCallerRole", () => {
  it("returns the team member's role when a row exists", async () => {
    expect(await getCallerRole(fakeDrizzle([{ role: "operator" }]), uniqueUid())).toBe("operator");
  });

  it("defaults to owner for single-tenant users with no membership row", async () => {
    expect(await getCallerRole(fakeDrizzle([]), uniqueUid())).toBe("owner");
  });

  it("ignores unknown role values and falls back to owner", async () => {
    expect(await getCallerRole(fakeDrizzle([{ role: "superduper" }]), uniqueUid())).toBe("owner");
  });

  it("caches within the TTL (second call does not re-query)", async () => {
    const limit = vi.fn().mockResolvedValue([{ role: "admin" }]);
    const chain: any = {
      select: () => chain,
      from: () => chain,
      where: () => chain,
      orderBy: () => chain,
      limit,
    };
    const uid = uniqueUid();
    await getCallerRole(chain, uid);
    await getCallerRole(chain, uid);
    expect(limit).toHaveBeenCalledTimes(1);
  });
});

describe("requirePermission", () => {
  it("calls next() when the role holds the permission", async () => {
    const audit = { logSecurity: vi.fn().mockResolvedValue(undefined) };
    const { requirePermission } = createRbacMiddleware({
      drizzle: fakeDrizzle([{ role: "owner" }]),
      auditLogger: audit,
    });
    const { req, res } = mockReqRes(uniqueUid());
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
    const audit = { logSecurity: vi.fn().mockResolvedValue(undefined) };
    const uid = uniqueUid();
    const { requirePermission } = createRbacMiddleware({
      drizzle: fakeDrizzle([{ role: "viewer" }]),
      auditLogger: audit,
    });
    const { req, res } = mockReqRes(uid);
    const next = vi.fn();
    await requirePermission("billing.manage")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe("FORBIDDEN");
    expect(audit.logSecurity).toHaveBeenCalledWith(
      "unauthorized_access",
      expect.objectContaining({ userId: uid, resource: "billing.manage" }),
    );
  });

  it("fails CLOSED (403) when the role lookup throws", async () => {
    const { requirePermission } = createRbacMiddleware({
      drizzle: fakeDrizzle(new Error("db down")),
    });
    const { req, res } = mockReqRes(uniqueUid());
    const next = vi.fn();
    await requirePermission("calls.read")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
  });
});

describe("requireRole", () => {
  it("allows a role at or above the threshold", async () => {
    const { requireRole } = createRbacMiddleware({ drizzle: fakeDrizzle([{ role: "admin" }]) });
    const { req, res } = mockReqRes(uniqueUid());
    const next = vi.fn();
    await requireRole("operator")(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("denies a role below the threshold with 403", async () => {
    const { requireRole } = createRbacMiddleware({ drizzle: fakeDrizzle([{ role: "viewer" }]) });
    const { req, res } = mockReqRes(uniqueUid());
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
