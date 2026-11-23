import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPool, asTenant, createUser } from "./helpers";

const pool = adminPool();
let tenant = "";

beforeAll(async () => {
  tenant = await createUser(pool, "dnc");
});
afterAll(() => pool.end());

describe("Do Not Contact writes under concurrency", () => {
  it("records one row when several STOP deliveries for a number land at once", async () => {
    await Promise.all(
      Array.from({ length: 6 }, () =>
        asTenant(pool, tenant, (c) =>
          c.query(
            `INSERT INTO wireline_dnc_list (user_id, phone, reason, source)
             VALUES ($1, '+13125550122', 'opt-out', 'sms_opt_out')
             ON CONFLICT (user_id, phone) DO NOTHING`,
            [tenant],
          ),
        ),
      ),
    );
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM wireline_dnc_list WHERE user_id = $1 AND phone = '+13125550122'",
      [tenant],
    );
    expect(rows[0].n).toBe(1);
  });
});
