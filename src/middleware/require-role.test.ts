import { describe, it, expect, beforeEach } from "vitest";
import { createRbacMiddleware, invalidateRoleCache } from "./require-role";

/**
 * Minimal Supabase client double — only implements the .from().select()
 * chain that getCallerRole calls. We tune the role per test by setting
 * `mockRole` before each call.
 */
function makeMockDb(mockRole: string | null) {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(mockRole === null ? [] : [{ role: mockRole }]),
  } as any;
}

function makeResponse() {
  const captured: { status: number; body: any } = { status: 200, body: null };
  return {
    status(code: number) {
      captured.status = code;
      return this;
    },
    json(body: any) {
      captured.body = body;
      return this;
    },
    captured,
  } as any;
}

function makeRequest(userId: string | null) {
  return {
    user: userId ? { id: userId } : undefined,
    ip: "127.0.0.1",
    get: (_h: string) => "test-agent",
  } as any;
}

async function runMw(mw: any, req: any, res: any): Promise<boolean> {
  let nextCalled = false;
  await mw(req, res, () => {
    nextCalled = true;
  });
  return nextCalled;
}

describe("requirePermission", () => {
  beforeEach(() => {
    invalidateRoleCache("user-123");
  });

  it("allows owner to use any permission", async () => {
    const db = makeMockDb("owner");
    const { requirePermission } = createRbacMiddleware({ drizzle: db });
    const res = makeResponse();
    const next = await runMw(requirePermission("quotas.override"), makeRequest("user-123"), res);
    expect(next).toBe(true);
  });

  it("allows admin for quotas.override", async () => {
    const db = makeMockDb("admin");
    const { requirePermission } = createRbacMiddleware({ drizzle: db });
    const res = makeResponse();
    const next = await runMw(requirePermission("quotas.override"), makeRequest("user-123"), res);
    expect(next).toBe(true);
  });

  it("blocks operator from quotas.override and audits the denial", async () => {
    const db = makeMockDb("operator");
    const audited: any[] = [];
    const auditLogger = {
      logSecurity: async (action: string, params: any) => {
        audited.push({ action, params });
      },
    };
    const { requirePermission } = createRbacMiddleware({ drizzle: db, auditLogger });
    const res = makeResponse();
    const next = await runMw(requirePermission("quotas.override"), makeRequest("user-123"), res);
    expect(next).toBe(false);
    expect(res.captured.status).toBe(403);
    expect(res.captured.body.code).toBe("FORBIDDEN");
    // Audit log captures the refused privilege use (deferred via void).
    await new Promise((r) => setTimeout(r, 0));
    expect(audited).toHaveLength(1);
    expect(audited[0].action).toBe("unauthorized_access");
    expect(audited[0].params.resource).toBe("quotas.override");
    expect(audited[0].params.metadata.role).toBe("operator");
  });

  it("blocks viewer from quotas.override", async () => {
    const db = makeMockDb("viewer");
    const { requirePermission } = createRbacMiddleware({ drizzle: db });
    const res = makeResponse();
    const next = await runMw(requirePermission("quotas.override"), makeRequest("user-123"), res);
    expect(next).toBe(false);
    expect(res.captured.status).toBe(403);
  });

  it("blocks auditor from quotas.override", async () => {
    const db = makeMockDb("auditor");
    const { requirePermission } = createRbacMiddleware({ drizzle: db });
    const res = makeResponse();
    const next = await runMw(requirePermission("quotas.override"), makeRequest("user-123"), res);
    expect(next).toBe(false);
    expect(res.captured.status).toBe(403);
  });

  it("treats missing team-member row as owner (single-tenant default)", async () => {
    const db = makeMockDb(null);
    const { requirePermission } = createRbacMiddleware({ drizzle: db });
    const res = makeResponse();
    const next = await runMw(requirePermission("quotas.override"), makeRequest("user-123"), res);
    expect(next).toBe(true);
  });

  it("returns 401 when authenticateUser was skipped (no req.user)", async () => {
    const db = makeMockDb(null);
    const { requirePermission } = createRbacMiddleware({ drizzle: db });
    const res = makeResponse();
    const next = await runMw(requirePermission("quotas.override"), makeRequest(null), res);
    expect(next).toBe(false);
    expect(res.captured.status).toBe(401);
    expect(res.captured.body.code).toBe("AUTH_REQUIRED");
  });
});

describe("requireRole", () => {
  beforeEach(() => {
    invalidateRoleCache("user-123");
  });

  it("admin satisfies requireRole('admin')", async () => {
    const db = makeMockDb("admin");
    const { requireRole } = createRbacMiddleware({ drizzle: db });
    const res = makeResponse();
    const next = await runMw(requireRole("admin"), makeRequest("user-123"), res);
    expect(next).toBe(true);
  });

  it("operator does NOT satisfy requireRole('admin')", async () => {
    const db = makeMockDb("operator");
    const { requireRole } = createRbacMiddleware({ drizzle: db });
    const res = makeResponse();
    const next = await runMw(requireRole("admin"), makeRequest("user-123"), res);
    expect(next).toBe(false);
    expect(res.captured.status).toBe(403);
  });
});
