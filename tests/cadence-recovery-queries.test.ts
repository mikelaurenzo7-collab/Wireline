import { beforeEach, describe, expect, it, vi } from "vitest";

type Handler = (req: unknown, res: unknown) => Promise<unknown>;
const h = vi.hoisted(() => ({
  routes: new Map<string, Handler>(),
  queries: [] as { sql: string; params: unknown[] }[],
  inTransaction: false,
  committed: false,
}));
vi.mock("express", () => ({
  Router: () =>
    Object.fromEntries(
      ["get", "post", "patch", "delete"].map((method) => [
        method,
        (path: string, ...handlers: Handler[]) =>
          h.routes.set(`${method} ${path}`, handlers.at(-1)!),
      ]),
    ),
}));
vi.mock("../src/middleware/auth", () => ({ authenticateUser: () => {} }));
vi.mock("../src/lib/server-context", async () => {
  const { drizzle } = await import("drizzle-orm/pg-proxy");
  const db = drizzle(async (sql, params) => {
    h.queries.push({ sql, params });
    if (
      sql.startsWith('update "wireline_cadences"') ||
      (sql.startsWith("select") && sql.includes('from "wireline_cadences"'))
    ) {
      return {
        rows: [
          [
            "sequence",
            "tenant",
            "Follow Up",
            null,
            null,
            JSON.stringify([{ type: "sms", delayHours: 0 }]),
            true,
            "2026-09-20T12:00:00Z",
          ],
        ],
      };
    }
    if (sql.startsWith('select "id" from "wireline_outbound_leads"')) return { rows: [["1"]] };
    if (sql.startsWith('insert into "wireline_cadence_runs"'))
      return {
        rows: [
          [
            "run",
            "tenant",
            "sequence",
            "1",
            0,
            "2026-09-20T12:00:00Z",
            "active",
            null,
            "2026-09-20T12:00:00Z",
            "2026-09-20T12:00:00Z",
          ],
        ],
      };
    return { rows: [] };
  });
  // Keep the real Drizzle query compiler; only the transaction and driver are fixtures.
  db.transaction = (async (operation: (tx: typeof db) => Promise<unknown>) => {
    h.inTransaction = true;
    try {
      const result = await operation(db);
      h.committed = true;
      return result;
    } finally {
      h.inTransaction = false;
    }
  }) as typeof db.transaction;
  return { drizzle: db, log: { error: vi.fn() } };
});
import "../src/routes/cadence-routes";

async function invoke(method: string, path: string, body = {}) {
  const res = {
    json: vi.fn(() => {
      expect(h.inTransaction).toBe(false);
    }),
  };
  await h.routes.get(`${method} ${path}`)!(
    { user: { id: "tenant" }, params: { id: "sequence" }, body },
    res,
  );
  return res;
}
beforeEach(() => {
  h.queries = [];
  h.inTransaction = false;
  h.committed = false;
});

describe("sequence recovery persistence boundaries", () => {
  it("restores only legacy parent-paused runs with no active or newer enrollment", async () => {
    await invoke("patch", "/api/cadences/:id", { active: true });
    const recovery = h.queries.find((q) => q.sql.startsWith('update "wireline_cadence_runs"'))!;
    expect(recovery.params).toEqual(
      expect.arrayContaining([
        "active",
        "tenant",
        "sequence",
        "paused",
        "cadence inactive or deleted",
      ]),
    );
    expect(recovery.sql).toContain("not exists");
    expect(recovery.sql).toContain("newer.status = 'active'");
    expect(recovery.sql).toContain('newer.lead_id = "wireline_cadence_runs"."lead_id"');
    expect(recovery.sql).toContain("coalesce(newer.created_at");
    expect(recovery.sql).toContain('coalesce("wireline_cadence_runs"."next_due_at", now())');
    expect(h.committed).toBe(true);
  });

  it("does not recover paused runs on other sequence edits", async () => {
    await invoke("patch", "/api/cadences/:id", { active: false });
    expect(h.queries.some((q) => q.sql.startsWith('update "wireline_cadence_runs"'))).toBe(false);
  });

  it("distinguishes an explicit operator pause from the legacy parent marker", async () => {
    // RETURNING is empty in this fixture; inspect the write even when the route answers 404.
    await invoke("post", "/api/cadences/runs/:id/pause").catch(() => undefined);
    expect(h.queries[0].params).toContain("paused by account holder");
  });

  it("keeps unresolved runs outside the recent-history limit", async () => {
    await invoke("get", "/api/cadences/runs");
    const query = h.queries[0];
    expect(query.params).toEqual(["tenant", "active", "paused", "failed", "tenant", 200]);
    expect(query.sql).toContain(
      'or "wireline_cadence_runs"."id" in (select "id" from "wireline_cadence_runs"',
    );
    expect(query.sql).toMatch(/limit \$6\)\)\) order by/);
    expect(query.sql).not.toMatch(/limit \$\d+$/);
  });

  it("serializes enrollment with resume and responds only after commit", async () => {
    const res = await invoke("post", "/api/cadences/:id/enroll", { leadId: "1" });
    expect(h.queries[0].sql).toContain("for update");
    expect(h.queries[0].params).toEqual(["sequence", "tenant", 1]);
    expect(h.queries.some((q) => q.sql.startsWith('insert into "wireline_cadence_runs"'))).toBe(
      true,
    );
    expect(h.committed).toBe(true);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ run: expect.objectContaining({ id: "run" }) }),
    );
  });
});
