import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPool, asTenant, createUser } from "./helpers";

const pool = adminPool();
let tenantA = "";
let tenantB = "";

beforeAll(async () => {
  tenantA = await createUser(pool, "tenant-a");
  tenantB = await createUser(pool, "tenant-b");
});
afterAll(() => pool.end());

describe("production row security under wireline_server", () => {
  it("shows a tenant only its own preferences and refuses writes for another tenant", async () => {
    await asTenant(pool, tenantA, (c) =>
      c.query(
        'INSERT INTO wireline_user_preferences (user_id, preferences) VALUES ($1, \'{"k":"a"}\')',
        [tenantA],
      ),
    );
    const seenByB = await asTenant(pool, tenantB, (c) =>
      c.query("SELECT user_id FROM wireline_user_preferences WHERE user_id = $1", [tenantA]),
    );
    expect(seenByB.rowCount).toBe(0);
    await expect(
      asTenant(pool, tenantA, (c) =>
        c.query("INSERT INTO wireline_user_preferences (user_id, preferences) VALUES ($1, '{}')", [
          tenantB,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("keeps Do Not Contact entries private to the workspace that recorded them", async () => {
    await asTenant(pool, tenantA, (c) =>
      c.query(
        "INSERT INTO wireline_dnc_list (user_id, phone, reason, source) VALUES ($1, '+13125550111', 'opt-out', 'sms_opt_out')",
        [tenantA],
      ),
    );
    const own = await asTenant(pool, tenantA, (c) =>
      c.query("SELECT 1 FROM wireline_dnc_list WHERE phone = '+13125550111'"),
    );
    const other = await asTenant(pool, tenantB, (c) =>
      c.query("SELECT 1 FROM wireline_dnc_list WHERE phone = '+13125550111'"),
    );
    expect(own.rowCount).toBe(1);
    expect(other.rowCount).toBe(0);
  });

  it("lets the server append audit rows for any tenant but read only the current one", async () => {
    await asTenant(pool, tenantA, (c) =>
      c.query("INSERT INTO wireline_audit_log (user_id, action) VALUES ($1, 'db-lane.audit')", [
        tenantB,
      ]),
    );
    const readByA = await asTenant(pool, tenantA, (c) =>
      c.query("SELECT 1 FROM wireline_audit_log WHERE action = 'db-lane.audit'"),
    );
    const readByB = await asTenant(pool, tenantB, (c) =>
      c.query("SELECT 1 FROM wireline_audit_log WHERE action = 'db-lane.audit'"),
    );
    expect(readByA.rowCount).toBe(0);
    expect(readByB.rowCount).toBe(1);
  });

  it("reads nothing without a tenant, and the user table shows only the current user", async () => {
    const anonymous = await asTenant(pool, "", (c) => c.query("SELECT 1 FROM wireline_dnc_list"));
    expect(anonymous.rowCount).toBe(0);
    const users = await asTenant(pool, tenantA, (c) => c.query("SELECT id FROM wireline_users"));
    expect(users.rows.map((row) => row.id)).toEqual([tenantA]);
  });
});
