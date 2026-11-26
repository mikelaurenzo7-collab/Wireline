import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminPool, createUser } from "./helpers";

// The Drizzle push that prepares this database does not install routines, so
// install the reviewed purge body exactly as the migration ships it. It is
// CREATE OR REPLACE, so re-running the file against a prepared database is safe.
const MIGRATION = "drizzle/migrations/0198_retention_purge_thread_activity.sql";

const pool = adminPool();
let tenant = "";
let neighbour = "";

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000);

async function emailThread(userId: string, createdDaysAgo: number, lastMessageDaysAgo: number) {
  const { rows } = await pool.query(
    `INSERT INTO wireline_email_threads (user_id, thread_id, customer_email, created_at, last_message_at)
     VALUES ($1, $2, 'customer@example.test', $3, $4) RETURNING id`,
    [
      userId,
      `thread-${Math.random().toString(36).slice(2)}`,
      daysAgo(createdDaysAgo),
      daysAgo(lastMessageDaysAgo),
    ],
  );
  return rows[0].id as string;
}

async function emailMessage(userId: string, threadId: string, createdDaysAgo: number) {
  const { rows } = await pool.query(
    `INSERT INTO wireline_email_messages (user_id, thread_id, role, content, created_at)
     VALUES ($1, $2, 'user', 'hello', $3) RETURNING id::text`,
    [userId, threadId, daysAgo(createdDaysAgo)],
  );
  return rows[0].id as string;
}

let smsCustomer = 0;
async function smsThread(userId: string, createdDaysAgo: number, lastMessageDaysAgo: number) {
  // One thread per (tenant, destination, customer): give each its own customer.
  smsCustomer += 1;
  const { rows } = await pool.query(
    `INSERT INTO wireline_sms_threads (user_id, customer_number, destination_number, created_at, last_message_at)
     VALUES ($1, $2, '+13125550100', $3, $4) RETURNING id`,
    [
      userId,
      `+1312555${String(1000 + smsCustomer).padStart(4, "0")}`,
      daysAgo(createdDaysAgo),
      daysAgo(lastMessageDaysAgo),
    ],
  );
  return rows[0].id as string;
}

async function smsMessage(userId: string, threadId: string | null, createdDaysAgo: number) {
  const { rows } = await pool.query(
    `INSERT INTO wireline_sms_messages (user_id, thread_id, direction, body, created_at)
     VALUES ($1, $2, 'in', 'hello', $3) RETURNING id::text`,
    [userId, threadId, daysAgo(createdDaysAgo)],
  );
  return rows[0].id as string;
}

async function smsSendOperation(userId: string, threadId: string, createdDaysAgo: number) {
  const at = daysAgo(createdDaysAgo);
  const { rows } = await pool.query(
    `INSERT INTO wireline_sms_send_operations
       (user_id, thread_id, idempotency_key, request_hash, status, created_at, updated_at)
     VALUES ($1, $2, $3, 'hash', 'accepted', $4, $4) RETURNING id`,
    [userId, threadId, `op-${Math.random().toString(36).slice(2)}`, at],
  );
  return rows[0].id as string;
}

async function exists(table: string, id: string) {
  const { rows } = await pool.query(`SELECT 1 FROM ${table} WHERE id::text = $1`, [id]);
  return rows.length === 1;
}

async function purge(userId: string, retentionDays = 365) {
  const { rows } = await pool.query(
    "SELECT table_name, rows_deleted FROM wireline_purge_old_data($1, $2)",
    [userId, retentionDays],
  );
  return Object.fromEntries(rows.map((row) => [row.table_name, row.rows_deleted])) as Record<
    string,
    number
  >;
}

beforeAll(async () => {
  await pool.query(readFileSync(resolve(process.cwd(), MIGRATION), "utf8"));
  tenant = await createUser(pool, "retention");
  neighbour = await createUser(pool, "retention-neighbour");
});
afterAll(() => pool.end());

describe("retention purge on a real database", () => {
  it("keeps recent messages in a long-running thread and removes aged SMS history", async () => {
    // Email: a thread opened 400 days ago that is still active.
    const activeEmail = await emailThread(tenant, 400, 2);
    const activeEmailOld = await emailMessage(tenant, activeEmail, 380);
    const activeEmailRecent = await emailMessage(tenant, activeEmail, 2);
    // Email: last_message_at lags behind a message that is recent. The cascade
    // must not take the recent message even though the thread looks dormant.
    const laggingEmail = await emailThread(tenant, 400, 400);
    const laggingEmailRecent = await emailMessage(tenant, laggingEmail, 1);
    // Email: genuinely dormant.
    const dormantEmail = await emailThread(tenant, 400, 370);
    const dormantEmailMessage = await emailMessage(tenant, dormantEmail, 370);

    // SMS: a thread opened 400 days ago that is still active.
    const activeSms = await smsThread(tenant, 400, 3);
    const activeSmsOld = await smsMessage(tenant, activeSms, 380);
    const activeSmsRecent = await smsMessage(tenant, activeSms, 3);
    const activeSmsOldOperation = await smsSendOperation(tenant, activeSms, 380);
    const activeSmsRecentOperation = await smsSendOperation(tenant, activeSms, 3);
    // SMS: only a recent send operation remains (for example a rejected send
    // that never produced a message). Its thread must survive with it.
    const operationOnlySms = await smsThread(tenant, 400, 400);
    const operationOnlySmsRecentOperation = await smsSendOperation(tenant, operationOnlySms, 5);
    // SMS: genuinely dormant, with old messages and an old send operation.
    const dormantSms = await smsThread(tenant, 400, 370);
    const dormantSmsMessage = await smsMessage(tenant, dormantSms, 375);
    const dormantSmsOperation = await smsSendOperation(tenant, dormantSms, 375);
    // SMS: null-thread operational alert correlation rows.
    const oldAlertCorrelation = await smsMessage(tenant, null, 400);
    const recentAlertCorrelation = await smsMessage(tenant, null, 10);

    // Another tenant's equally old history is out of scope.
    const neighbourEmail = await emailThread(neighbour, 400, 400);
    const neighbourSms = await smsThread(neighbour, 400, 400);
    const neighbourSmsMessage = await smsMessage(neighbour, neighbourSms, 400);

    // The 5-year outbound purpose audit is never part of this sweep. Its 0194
    // guard admits root-scope deletes (terminal account deletion needs them),
    // so the purge list is what keeps these rows.
    const { rows: auditRows } = await pool.query(
      `INSERT INTO wireline_outbound_purpose_audit
         (user_id, channel, destination_e164, requested_purpose, effective_purpose, decision, created_at)
       VALUES ($1, 'sms', '+13125550199', 'service', 'service', 'allowed', $2) RETURNING id`,
      [tenant, daysAgo(400)],
    );
    const oldAudit = auditRows[0].id as string;

    const report = await purge(tenant);

    expect(await exists("wireline_email_threads", activeEmail)).toBe(true);
    expect(await exists("wireline_email_messages", activeEmailRecent)).toBe(true);
    expect(await exists("wireline_email_messages", activeEmailOld)).toBe(false);
    expect(await exists("wireline_email_threads", laggingEmail)).toBe(true);
    expect(await exists("wireline_email_messages", laggingEmailRecent)).toBe(true);
    expect(await exists("wireline_email_threads", dormantEmail)).toBe(false);
    expect(await exists("wireline_email_messages", dormantEmailMessage)).toBe(false);

    expect(await exists("wireline_sms_threads", activeSms)).toBe(true);
    expect(await exists("wireline_sms_messages", activeSmsRecent)).toBe(true);
    expect(await exists("wireline_sms_messages", activeSmsOld)).toBe(false);
    expect(await exists("wireline_sms_send_operations", activeSmsRecentOperation)).toBe(true);
    expect(await exists("wireline_sms_send_operations", activeSmsOldOperation)).toBe(false);
    expect(await exists("wireline_sms_threads", operationOnlySms)).toBe(true);
    expect(await exists("wireline_sms_send_operations", operationOnlySmsRecentOperation)).toBe(
      true,
    );
    expect(await exists("wireline_sms_threads", dormantSms)).toBe(false);
    expect(await exists("wireline_sms_messages", dormantSmsMessage)).toBe(false);
    expect(await exists("wireline_sms_send_operations", dormantSmsOperation)).toBe(false);
    expect(await exists("wireline_sms_messages", oldAlertCorrelation)).toBe(false);
    expect(await exists("wireline_sms_messages", recentAlertCorrelation)).toBe(true);

    expect(await exists("wireline_email_threads", neighbourEmail)).toBe(true);
    expect(await exists("wireline_sms_threads", neighbourSms)).toBe(true);
    expect(await exists("wireline_sms_messages", neighbourSmsMessage)).toBe(true);
    expect(await exists("wireline_outbound_purpose_audit", oldAudit)).toBe(true);

    // Child rows are counted where they were purged, not hidden in a cascade.
    expect(report).toEqual({
      wireline_email_messages: 2,
      wireline_email_threads: 1,
      wireline_sms_messages: 3,
      wireline_sms_send_operations: 2,
      wireline_sms_threads: 1,
    });

    // A second run finds nothing more to remove.
    expect(await purge(tenant)).toEqual({});
  });

  it("aborts instead of reporting a partial purge when a delete fails", async () => {
    const thread = await smsThread(tenant, 400, 400);
    await smsMessage(tenant, thread, 400);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`
        CREATE FUNCTION pg_temp.reject_sms_delete() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'simulated delete failure'; END $$`);
      await client.query(`
        CREATE TRIGGER reject_sms_delete BEFORE DELETE ON wireline_sms_messages
        FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_sms_delete()`);
      await expect(
        client.query("SELECT * FROM wireline_purge_old_data($1, 365)", [tenant]),
      ).rejects.toThrow("simulated delete failure");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    expect(await exists("wireline_sms_threads", thread)).toBe(true);
  });

  it("keeps input validation, a pinned search path and caller-rights execution", async () => {
    await expect(purge(tenant, 0)).rejects.toThrow("p_retention_days must be at least 1");
    await expect(pool.query("SELECT * FROM wireline_purge_old_data(NULL, 365)")).rejects.toThrow(
      "p_user_id is required",
    );
    const { rows } = await pool.query(
      `SELECT prosecdef, proconfig
         FROM pg_proc
        WHERE oid = to_regprocedure('public.wireline_purge_old_data(uuid,integer)')`,
    );
    expect(rows[0].prosecdef).toBe(false);
    expect(rows[0].proconfig).toEqual(["search_path=public, pg_temp"]);
  });
});
