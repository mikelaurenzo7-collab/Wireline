import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ execute: vi.fn(), warn: vi.fn() }));
vi.mock("../src/lib/server-context", () => ({
  drizzle: { execute: h.execute },
  log: { warn: h.warn },
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: vi.fn() }));
vi.mock("../src/middleware/api-rate-limits", () => ({ claudeRateLimiter: vi.fn() }));
vi.mock("../src/middleware/input-validation", () => ({ validate: () => vi.fn() }));
vi.mock("../src/lib/browser-handoff-token", () => ({
  BROWSER_HANDOFF_TTL_MS: 60_000,
  createBrowserHandoffId: () => "wlbh_test",
  hashBrowserHandoffId: () => "hashed-handoff",
  encryptBrowserHandoffContext: () => "encrypted-context",
  decryptBrowserHandoffContext: () => ({ title: "Private context", url: "https://example.com/" }),
  isBrowserHandoffVaultConfigured: () => true,
  studioHandoffUrl: () => "/studio?handoff_id=wlbh_test",
}));

function snapshot() {
  return {
    runtime_role: "wireline_server",
    rls_enabled: true,
    can_select: true,
    can_insert: true,
    can_update: true,
    can_delete: true,
    columns: ["id_hash", "user_id", "context_encrypted", "expires_at", "redeemed_at", "created_at"],
    policies: [
      {
        policyname: "deny_direct_api_access",
        permissive: "PERMISSIVE",
        roles: ["anon", "authenticated"],
        cmd: "ALL",
        qual: "false",
        with_check: "false",
      },
      {
        policyname: "tenant_isolation",
        permissive: "PERMISSIVE",
        roles: ["wireline_server"],
        cmd: "ALL",
        qual: "(user_id = ( SELECT wireline_current_user_id() AS wireline_current_user_id))",
        with_check: "(user_id = ( SELECT wireline_current_user_id() AS wireline_current_user_id))",
      },
    ],
  };
}

const sqlText = (query: Parameters<PgDialect["sqlToQuery"]>[0]) =>
  new PgDialect().sqlToQuery(query);

type RouteLayer = {
  route?: { path: string; stack: Array<{ handle: (req: unknown, res: unknown) => Promise<void> }> };
};

describe("browser handoff storage uses promoted schema without request-time DDL", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("confirms the tenant role, columns, DML grants and exact tenant RLS with a read-only query", async () => {
    const { ensureBrowserHandoffSchema } = await import("../src/routes/browser-handoff-routes");
    h.execute.mockResolvedValue({ rows: [snapshot()] });

    await Promise.all([ensureBrowserHandoffSchema(), ensureBrowserHandoffSchema()]);

    expect(h.execute).toHaveBeenCalledTimes(1);
    const { sql } = sqlText(h.execute.mock.calls[0][0]);
    expect(sql.trim()).toMatch(/^SELECT\s/);
    expect(sql).toContain("pg_policies");
    expect(sql).toContain("has_table_privilege");
    expect(sql).not.toMatch(/\b(?:CREATE|ALTER|DROP|GRANT|REVOKE)\b/i);
  });

  it.each([
    "root-role",
    "rls-disabled",
    "missing-grant",
    "missing-column",
    "missing-policy",
    "broader-using",
    "broader-check",
    "different-tenant-function",
    "extra-public-policy",
    "public-tenant-policy",
    "wrong-command",
  ])("fails closed for %s", async (problem) => {
    const { browserHandoffStorageReady } = await import("../src/routes/browser-handoff-routes");
    const row = snapshot();
    if (problem === "root-role") row.runtime_role = "postgres";
    if (problem === "rls-disabled") row.rls_enabled = false;
    if (problem === "missing-grant") row.can_insert = false;
    if (problem === "missing-column") row.columns.pop();
    if (problem === "missing-policy") row.policies.pop();
    if (problem === "broader-using") row.policies[1].qual += " OR true";
    if (problem === "broader-check") row.policies[1].with_check = "true";
    if (problem === "different-tenant-function") row.policies[1].qual = "user_id = auth.uid()";
    if (problem === "extra-public-policy")
      row.policies.push({ ...row.policies[1], policyname: "public_access", roles: ["public"] });
    if (problem === "public-tenant-policy") row.policies[1].roles = ["public"];
    if (problem === "wrong-command") row.policies[1].cmd = "SELECT";
    expect(browserHandoffStorageReady(row)).toBe(false);
  });

  it.each([
    "(user_id = wireline_current_user_id())",
    "(user_id = (SELECT public.wireline_current_user_id()))",
  ])("accepts equivalent PostgreSQL owner-equality rendering: %s", async (expression) => {
    const { browserHandoffStorageReady } = await import("../src/routes/browser-handoff-routes");
    const row = snapshot();
    row.policies[1].qual = expression;
    row.policies[1].with_check = expression;
    expect(browserHandoffStorageReady(row)).toBe(true);
  });

  it("returns actionable unavailability before handoff data writes when schema is absent", async () => {
    const { ensureBrowserHandoffSchema } = await import("../src/routes/browser-handoff-routes");
    h.execute.mockResolvedValue({ rows: [] });

    await expect(ensureBrowserHandoffSchema()).rejects.toMatchObject({
      status: 503,
      code: "BROWSER_HANDOFF_STORAGE_UNAVAILABLE",
    });
    expect(h.execute).toHaveBeenCalledTimes(1);
  });

  it("rechecks after a transient database failure instead of poisoning the process cache", async () => {
    const { ensureBrowserHandoffSchema } = await import("../src/routes/browser-handoff-routes");
    h.execute
      .mockRejectedValueOnce(new Error("private database diagnostic"))
      .mockResolvedValueOnce({ rows: [snapshot()] });

    await expect(ensureBrowserHandoffSchema()).rejects.toMatchObject({ status: 503 });
    await expect(ensureBrowserHandoffSchema()).resolves.toBeUndefined();
    expect(h.execute).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(h.warn.mock.calls)).not.toContain("private database diagnostic");
  });

  it("redeems with owner, expiry and one-time predicates after read-only readiness", async () => {
    const { default: router } = await import("../src/routes/browser-handoff-routes");
    h.execute
      .mockResolvedValueOnce({ rows: [snapshot()] })
      .mockResolvedValueOnce({ rows: [{ context_encrypted: "encrypted-context" }] });
    const route = (router.stack as RouteLayer[]).find(
      (layer) => layer.route?.path === "/api/browser/handoff/redeem",
    )?.route;
    const handler = route?.stack.at(-1)?.handle;
    expect(handler).toBeDefined();
    const json = vi.fn();
    const owner = "11111111-1111-4111-8111-111111111111";
    await handler!({ user: { id: owner }, query: { handoff_id: "wlbh_test" } }, { json });

    const query = sqlText(h.execute.mock.calls[1][0]);
    expect(query.sql).toContain("AND user_id =");
    expect(query.sql).toContain("AND redeemed_at IS NULL");
    expect(query.sql).toContain("AND expires_at > now()");
    expect(query.params).toContain(owner);
    expect(query.params).toContain("hashed-handoff");
    expect(json).toHaveBeenCalledWith({
      context: { title: "Private context", url: "https://example.com/" },
    });
  });

  it("exchanges private page context only after readiness and stores its encrypted owner-bound form", async () => {
    const { default: router } = await import("../src/routes/browser-handoff-routes");
    h.execute
      .mockResolvedValueOnce({ rows: [snapshot()] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const route = (router.stack as RouteLayer[]).find(
      (layer) => layer.route?.path === "/api/browser/handoff/exchange",
    )?.route;
    const handler = route?.stack.at(-1)?.handle;
    expect(handler).toBeDefined();
    const json = vi.fn();
    const owner = "11111111-1111-4111-8111-111111111111";
    await handler!(
      {
        user: { id: owner },
        body: {
          version: 1,
          source: "browser-extension",
          capturedAt: new Date().toISOString(),
          title: "Private customer record",
          url: "https://example.com/private",
          selection: "Private customer notes",
        },
      },
      { json },
    );

    expect(h.execute).toHaveBeenCalledTimes(3);
    const query = sqlText(h.execute.mock.calls[2][0]);
    expect(query.sql).toContain("INSERT INTO wireline_browser_handoffs");
    expect(query.params).toContain(owner);
    expect(query.params).toContain("encrypted-context");
    expect(JSON.stringify(query)).not.toContain("Private customer");
    expect(json).toHaveBeenCalledWith({
      handoff_id: "wlbh_test",
      studio_url: "/studio?handoff_id=wlbh_test",
    });
  });
});
