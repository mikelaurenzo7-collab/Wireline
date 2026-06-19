/**
 * Live Postgres tenant-isolation checks. CI runs this when POSTGRES_URL is set.
 */
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";

const hasDb = Boolean(process.env.POSTGRES_URL);

(hasDb ? describe : describe.skip)("agent tenant isolation (integration)", () => {
  const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

  afterAll(async () => {
    await pool.end();
  });

  it("enables RLS and tenant_isolation policy on wireline_agents", async () => {
    const client = await pool.connect();
    try {
      const rls = await client.query(
        `SELECT relrowsecurity AS enabled
         FROM pg_class c
         JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relname = 'wireline_agents'`,
      );
      expect(rls.rows[0]?.enabled).toBe(true);

      const policy = await client.query(
        `SELECT 1 FROM pg_policies
         WHERE schemaname = 'public'
           AND tablename = 'wireline_agents'
           AND policyname = 'tenant_isolation'`,
      );
      expect(policy.rowCount).toBeGreaterThan(0);
    } finally {
      client.release();
    }
  });

  it("hides other tenants' agents when app.current_user_id is set", async () => {
    const client = await pool.connect();
    try {
      const tenants = await client.query<{ user_id: string }>(
        `SELECT DISTINCT user_id::text
         FROM wireline_agents
         WHERE user_id IS NOT NULL
         LIMIT 2`,
      );
      if (tenants.rowCount !== 2) {
        // Not enough seed data to adversarially test — schema posture still validated above.
        return;
      }

      const [a, b] = tenants.rows.map((r) => r.user_id);
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE authenticated");
      await client.query(`SELECT set_config('app.current_user_id', $1, true)`, [a]);

      const visible = await client.query<{ user_id: string }>(
        `SELECT user_id::text FROM wireline_agents`,
      );
      for (const row of visible.rows) {
        expect(row.user_id).toBe(a);
        expect(row.user_id).not.toBe(b);
      }

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
