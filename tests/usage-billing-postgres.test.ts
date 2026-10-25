/**
 * Optional PostgreSQL integration suite. Run only against a disposable local
 * database named botbound_usage_review. Never falls back to POSTGRES_URL.
 */
import { readFileSync } from "node:fs";
import pg from "pg";
import { drizzle as postgresDrizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "../src/db/schema";

const h = vi.hoisted(() => ({ db: null as unknown }));
vi.mock("../src/lib/server-context", () => ({
  get drizzle() {
    return h.db;
  },
  log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
import {
  admitAccountUsage,
  admitVoiceUsage,
  createUsageStore,
  reportAllPendingUsage,
  setUsageAddonQuantities,
  setUsageMonthlyCap,
  settleVoiceUsageReceipt,
  usagePeriodKey,
} from "../src/lib/usage-billing-store";
import {
  recordUsageEvent,
  reportPendingUsageForUser,
  USAGE_REPORT_RETRY_WINDOW_MS,
} from "../src/lib/usage-billing-ledger";
import { reserveSmsUsage, settleSmsUsage, hasReleasedSmsUsage } from "../src/lib/sms-usage-billing";
vi.mock("../src/lib/usage-billing-reconciliation", () => ({ reconcileStripeMeterErrors: vi.fn() }));
vi.mock("../src/lib/spend-guards", () => ({
  clearBudgetCache: vi.fn(),
  recordDailySpend: vi.fn(),
  evaluateSpend: vi.fn(),
}));

const connectionString = process.env.USAGE_BILLING_TEST_DATABASE_URL;
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const NOW = new Date(Math.floor(Date.now() / 1000) * 1000);
const START = new Date(NOW.getTime() - 24 * 60 * 60 * 1000);
const END = new Date(NOW.getTime() + 29 * 24 * 60 * 60 * 1000);
const PERIOD = usagePeriodKey(END, "sub_review");

describe.skipIf(!connectionString)("usage billing on disposable PostgreSQL", () => {
  let pool: pg.Pool;
  let db: ReturnType<typeof postgresDrizzle<typeof schema>>;

  beforeAll(async () => {
    const target = new URL(connectionString!);
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
      target.pathname !== "/botbound_usage_review"
    )
      throw new Error(
        "Usage billing tests require the dedicated local botbound_usage_review database.",
      );
    pool = new pg.Pool({ connectionString, max: 6 });
    db = postgresDrizzle(pool, { schema });
    h.db = db;
    await pool.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'wireline_server') THEN CREATE ROLE wireline_server; END IF;
      END $$;
      CREATE OR REPLACE FUNCTION public.wireline_current_user_id() RETURNS uuid
        LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.current_user_id', true), '')::uuid $$;
      CREATE TABLE IF NOT EXISTS wireline_users (id uuid PRIMARY KEY, email text);
      CREATE TABLE IF NOT EXISTS wireline_subscriptions (
        user_id uuid PRIMARY KEY, stripe_customer_id text, stripe_subscription_id text,
        plan text, status text, current_period_end timestamptz
      );
      CREATE TABLE IF NOT EXISTS wireline_computer_tasks (
        id uuid PRIMARY KEY, user_id uuid, usage_receipt jsonb, finished_at timestamptz
      );
      CREATE TABLE IF NOT EXISTS wireline_audit_log (
        id bigserial PRIMARY KEY, user_id uuid, resource_id text, event_type text,
        metadata jsonb, created_at timestamptz DEFAULT now()
      );
      ALTER TABLE wireline_audit_log
        ADD COLUMN IF NOT EXISTS action text,
        ADD COLUMN IF NOT EXISTS provider text,
        ADD COLUMN IF NOT EXISTS model text,
        ADD COLUMN IF NOT EXISTS input_tokens integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS output_tokens integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS cache_read_tokens integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS cache_create_tokens integer DEFAULT 0,
        ADD COLUMN IF NOT EXISTS cost_usd numeric(12,6) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS latency_ms integer,
        ADD COLUMN IF NOT EXISTS severity text DEFAULT 'info',
        ADD COLUMN IF NOT EXISTS actor_email text,
        ADD COLUMN IF NOT EXISTS resource_type text,
        ADD COLUMN IF NOT EXISTS ip_address text,
        ADD COLUMN IF NOT EXISTS user_agent text,
        ADD COLUMN IF NOT EXISTS idempotency_key text;
      CREATE TABLE IF NOT EXISTS wireline_spend_budgets (
        user_id uuid PRIMARY KEY, monthly_limit_usd numeric(12,2),
        hard_cap boolean, enabled boolean
      );
    `);
    for (let replay = 0; replay < 2; replay++) {
      for (const name of [
        "0187_usage_billing",
        "0189_usage_billing_periods",
        "0190_usage_plan_tiers",
        "0191_shared_sms_usage",
      ])
        await pool.query(
          readFileSync(new URL(`../drizzle/migrations/${name}.sql`, import.meta.url), "utf8"),
        );
    }
  });

  beforeEach(async () => {
    vi.stubEnv("USAGE_BILLING_ENABLED", "true");
    await pool.query(`TRUNCATE wireline_usage_meter_events, wireline_usage_spend_controls,
      wireline_usage_billing_periods, wireline_subscriptions, wireline_computer_tasks,
      wireline_audit_log, wireline_spend_budgets, wireline_users CASCADE`);
    await pool.query("INSERT INTO wireline_users(id) VALUES ($1), ($2)", [USER, OTHER]);
    await pool.query(
      `INSERT INTO wireline_subscriptions VALUES ($1, 'cus_review', 'sub_review', 'usage', 'active', $2)`,
      [USER, END],
    );
    await setUsageAddonQuantities(
      USER,
      { numbers: 1, emailAddresses: 0 },
      {
        stripeCustomerId: "cus_review",
        stripeSubscriptionId: "sub_review",
        startsAt: START,
        endsAt: END,
      },
    );
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });
  afterAll(async () => {
    await pool?.end();
  });

  const record = async (sourceId: string, quantity: number) =>
    recordUsageEvent(createUsageStore(), {
      userId: USER,
      periodKey: PERIOD,
      meter: "call_minutes",
      sourceType: "voice_call",
      sourceId,
      quantity,
      occurredAt: NOW,
    });

  it("serializes SMS admission against the shared allowance and releases only proven failures", async () => {
    await setUsageMonthlyCap(USER, 27);
    await record("calls-before-sms", 67.84);
    const admissions = await Promise.allSettled([
      reserveSmsUsage(USER, "sms-one", 1),
      reserveSmsUsage(USER, "sms-two", 1),
    ]);
    expect(admissions.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(admissions.filter((result) => result.status === "rejected")).toHaveLength(1);
    const sourceId = admissions[0].status === "fulfilled" ? "sms-one" : "sms-two";
    expect(await hasReleasedSmsUsage(USER, sourceId)).toBe(false);
    expect(await settleSmsUsage(OTHER, sourceId, 0)).toBe(false);
    expect(await settleSmsUsage(USER, sourceId, 0)).toBe(true);
    expect(await settleSmsUsage(USER, sourceId, 0)).toBe(true);
    expect(await hasReleasedSmsUsage(USER, sourceId)).toBe(true);
    await expect(reserveSmsUsage(USER, sourceId, 1)).rejects.toMatchObject({
      code: "SMS_FUNDING_SETTLED",
    });
    await expect(reserveSmsUsage(USER, "fresh-attempt", 1)).resolves.toEqual({ periodKey: PERIOD });
  });

  it("preserves settled SMS for final-invoice reconciliation after cancellation and a release pause", async () => {
    await reserveSmsUsage(USER, "accepted-sms", 3);
    await reserveSmsUsage(USER, "accepted-sms", 3);
    await pool.query("UPDATE wireline_subscriptions SET status = 'canceled'");
    vi.stubEnv("USAGE_BILLING_ENABLED", "false");
    await settleSmsUsage(USER, "accepted-sms", 2);
    await settleSmsUsage(USER, "accepted-sms", 2);
    await expect(settleSmsUsage(USER, "accepted-sms", 0)).rejects.toThrow(
      "different definitive outcome",
    );
    const send = vi.fn().mockResolvedValue(undefined);
    expect(await reportPendingUsageForUser(createUsageStore(), { send }, USER, new Date())).toEqual(
      {
        reported: 0,
        skipped: 0,
        failed: 1,
      },
    );
    expect(send).not.toHaveBeenCalled();
    const rows = await pool.query(
      "SELECT period_key, quantity, status FROM wireline_usage_meter_events",
    );
    expect(rows.rows).toEqual([
      { period_key: PERIOD, quantity: "2.0000", status: "reconciliation_required" },
    ]);
  });

  it("reports accepted SMS exactly once as shared work credits during its open period", async () => {
    await reserveSmsUsage(USER, "accepted-sms", 3);
    await settleSmsUsage(USER, "accepted-sms", 2);
    const send = vi.fn().mockResolvedValue(undefined);
    await reportPendingUsageForUser(createUsageStore(), { send }, USER, new Date());
    await settleSmsUsage(USER, "accepted-sms", 2);
    await reportPendingUsageForUser(createUsageStore(), { send }, USER, new Date());
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ meter: "sms_segments", value: 8, stripeCustomerId: "cus_review" }),
    );
  });

  it("commits the frozen request before Stripe I/O and retries the same amount after a cap increase", async () => {
    await setUsageMonthlyCap(USER, 30);
    await record("timed-out", 200);
    const send = vi.fn(async () => {
      // A different connection must see the prepared request before the call.
      const result = await pool.query(
        "SELECT report_attempt, billable_quantity FROM wireline_usage_meter_events",
      );
      expect(result.rows[0].report_attempt.value).toBe(2000); // $22 fixed + $8 headroom
      expect(Number(result.rows[0].billable_quantity)).toBe(80);
      throw new Error("Stripe response lost");
    });
    await reportPendingUsageForUser(createUsageStore(), { send }, USER, NOW);
    await setUsageMonthlyCap(USER, 100);
    const retry = vi.fn().mockResolvedValue(undefined);
    await reportPendingUsageForUser(createUsageStore(), { send: retry }, USER, NOW);
    expect(retry).toHaveBeenCalledWith(expect.objectContaining({ value: 2000 }));
    expect(
      (await pool.query("SELECT status FROM wireline_usage_meter_events")).rows[0].status,
    ).toBe("reported");
  });

  it("keeps old period caps, tier and add-ons unchanged after renewal", async () => {
    await setUsageMonthlyCap(USER, 30);
    const end = new Date(END.getTime() + 30 * 86400_000);
    await pool.query("UPDATE wireline_subscriptions SET current_period_end = $1", [end]);
    await setUsageAddonQuantities(
      USER,
      { numbers: 2, emailAddresses: 1 },
      {
        tier: "plus",
        stripeCustomerId: "cus_review",
        stripeSubscriptionId: "sub_review",
        startsAt: END,
        endsAt: end,
      },
    );
    // Cap editing is allowed only in the actual current period, not a future one.
    const rows = (
      await pool.query(
        "SELECT tier, monthly_cap_usd, number_addons, email_address_addons FROM wireline_usage_billing_periods ORDER BY starts_at",
      )
    ).rows;
    expect(rows).toEqual([
      { tier: "starter", monthly_cap_usd: "30.00", number_addons: 1, email_address_addons: 0 },
      { tier: "plus", monthly_cap_usd: "30.00", number_addons: 2, email_address_addons: 1 },
    ]);
  });

  it("blocks a midperiod plan change without rewriting the earned allowance", async () => {
    await setUsageAddonQuantities(
      USER,
      { numbers: 1, emailAddresses: 0 },
      {
        tier: "plus",
        stripeCustomerId: "cus_review",
        stripeSubscriptionId: "sub_review",
        startsAt: START,
        endsAt: END,
      },
    );
    await expect(admitAccountUsage(USER, "call_minutes")).rejects.toMatchObject({
      statusCode: 503,
    });
    const row = (
      await pool.query("SELECT tier, blocked_reason FROM wireline_usage_billing_periods")
    ).rows[0];
    expect(row).toEqual({
      tier: "starter",
      blocked_reason: "subscription_change_requires_invoice_reconciliation",
    });
  });

  it.each(["lite", "standard", "plus"] as const)(
    "uses the %s allowance and rejects unknown SQL tiers",
    async (tier) => {
      const { usageTier } = await import("../src/lib/usage-billing-catalog");
      const plan = usageTier(tier);
      await pool.query("UPDATE wireline_usage_billing_periods SET tier = $1, number_addons = 0", [
        tier,
      ]);
      await pool.query("UPDATE wireline_usage_spend_controls SET tier = $1, number_addons = 0", [
        tier,
      ]);
      expect(await admitAccountUsage(USER, "call_minutes")).toMatchObject({
        maxUnits: (100 - plan.monthlyUsd + plan.includedWorkUsd) / 0.25,
      });
      await expect(
        pool.query("UPDATE wireline_usage_billing_periods SET tier = 'unlimited'"),
      ).rejects.toThrow(/check constraint/);
    },
  );

  it("blocks a mid-period quantity change instead of guessing prorated fixed charges", async () => {
    await setUsageAddonQuantities(
      USER,
      { numbers: 2, emailAddresses: 0 },
      {
        stripeCustomerId: "cus_review",
        stripeSubscriptionId: "sub_review",
        startsAt: START,
        endsAt: END,
      },
    );
    await expect(admitAccountUsage(USER, "call_minutes")).rejects.toMatchObject({
      statusCode: 503,
    });
    const result = await pool.query(
      "SELECT number_addons, blocked_reason FROM wireline_usage_billing_periods",
    );
    expect(result.rows[0]).toEqual({
      number_addons: 1,
      blocked_reason: "subscription_change_requires_invoice_reconciliation",
    });
  });

  it("settles a pre-admitted call once after cancellation and a flag pause, retaining its original period", async () => {
    await db.transaction((tx) => admitVoiceUsage(tx, USER, "admitted-call"));
    vi.stubEnv("USAGE_BILLING_ENABLED", "false");
    await pool.query(
      "UPDATE wireline_subscriptions SET status = 'canceled', current_period_end = $1",
      [new Date(END.getTime() + 86400_000)],
    );
    expect(await settleVoiceUsageReceipt(USER, "admitted-call", 150)).toBe(true);
    expect(await settleVoiceUsageReceipt(USER, "admitted-call", 600)).toBe(true);
    expect(await reportAllPendingUsage()).toMatchObject({ accounts: 1, failed: 1, reported: 0 });
    const result = await pool.query(
      "SELECT period_key, quantity, status FROM wireline_usage_meter_events",
    );
    expect(result.rows[0]).toEqual({
      period_key: PERIOD,
      quantity: "2.5000",
      status: "reconciliation_required",
    });
  });

  it("blocks new usage while paused without reclassifying an existing usage account", async () => {
    vi.stubEnv("USAGE_BILLING_ENABLED", "false");
    await expect(admitAccountUsage(USER, "emails_handled")).rejects.toMatchObject({
      statusCode: 503,
    });
    await expect(
      db.transaction((tx) => admitVoiceUsage(tx, USER, "paused-call")),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(
      (await pool.query("SELECT count(*) FROM wireline_usage_meter_events")).rows[0].count,
    ).toBe("0");
  });

  it("keeps ambiguous charges visible when the identifier retry window expires", async () => {
    await record("uncertain", 100);
    await reportPendingUsageForUser(
      createUsageStore(),
      { send: vi.fn().mockRejectedValue(new Error("timeout")) },
      USER,
      NOW,
    );
    const send = vi.fn();
    await reportPendingUsageForUser(
      createUsageStore(),
      { send },
      USER,
      new Date(NOW.getTime() + USAGE_REPORT_RETRY_WINDOW_MS),
    );
    expect(send).not.toHaveBeenCalled();
    const row = (
      await pool.query(
        "SELECT status, billable_quantity, last_error FROM wireline_usage_meter_events",
      )
    ).rows[0];
    expect(row).toEqual({
      status: "reconciliation_required",
      billable_quantity: "100.0000",
      last_error: "ambiguous_report_beyond_deduplication_window",
    });
  });

  it("serializes concurrent preparations without exceeding the cap", async () => {
    await setUsageMonthlyCap(USER, 30);
    await record("parallel-a", 80);
    await record("parallel-b", 80);
    const accepted = new Map<string, number>();
    const send = vi.fn(async (request) => {
      if (accepted.has(request.identifier))
        expect(request.value).toBe(accepted.get(request.identifier));
      accepted.set(request.identifier, request.value);
    });
    await Promise.all([
      reportPendingUsageForUser(createUsageStore(), { send }, USER, NOW),
      reportPendingUsageForUser(createUsageStore(), { send }, USER, NOW),
    ]);
    expect([...accepted.values()].reduce((sum, value) => sum + value, 0)).toBe(2000);
  });

  it("reserves each admitted call's affordable duration and returns unused headroom on settlement", async () => {
    await setUsageMonthlyCap(USER, 30);
    // $22 fixed, 60 included minutes, and $8 at $0.25/minute = 92 minutes.
    const first = await db.transaction((tx) => admitVoiceUsage(tx, USER, "duration-a", 3600));
    expect(first.maxSeconds).toBe(3600);
    const second = await db.transaction((tx) => admitVoiceUsage(tx, USER, "duration-b", 3600));
    expect(second.maxSeconds).toBe(1200);
    await expect(
      db.transaction((tx) => admitVoiceUsage(tx, USER, "duration-c", 60)),
    ).rejects.toMatchObject({ statusCode: 402 });
    await settleVoiceUsageReceipt(USER, "duration-a", 60);
    const next = await db.transaction((tx) => admitVoiceUsage(tx, USER, "duration-c", 3600));
    expect(next.maxSeconds).toBe(3540);
  });

  it("freezes asynchronously rejected usage without letting a delayed HTTP success reopen it", async () => {
    await record("async-rejected", 75);
    const { holdStripeMeterError } = await vi.importActual<
      typeof import("../src/lib/usage-billing-reconciliation")
    >("../src/lib/usage-billing-reconciliation");
    await reportPendingUsageForUser(
      createUsageStore(),
      {
        send: async (event) => {
          await holdStripeMeterError(
            {
              id: "evt_async",
              type: "v1.billing.meter.error_report_triggered",
              data: {
                reason: {
                  error_count: 1,
                  error_types: [
                    {
                      code: "invalid_value",
                      error_count: 1,
                      sample_errors: [{ request: { identifier: event.identifier } }],
                    },
                  ],
                },
              },
            },
            "botbound_work_credits_v2",
          );
        },
      },
      USER,
      NOW,
    );
    const row = (
      await pool.query("SELECT status, billable_quantity FROM wireline_usage_meter_events")
    ).rows[0];
    expect(row).toEqual({ status: "reconciliation_required", billable_quantity: "75.0000" });
    await expect(admitAccountUsage(USER, "emails_handled")).rejects.toMatchObject({
      statusCode: 503,
    });
    expect(
      (await pool.query("SELECT blocked_reason FROM wireline_usage_billing_periods")).rows[0]
        .blocked_reason,
    ).toBe("stripe_meter_error_requires_reconciliation");
  });

  it("reserves an unresolved request before an older receipt arrives", async () => {
    await setUsageMonthlyCap(USER, 30);
    await record("already-attempted", 200);
    await reportPendingUsageForUser(
      createUsageStore(),
      { send: vi.fn().mockRejectedValue(new Error("timeout")) },
      USER,
      NOW,
    );
    await recordUsageEvent(createUsageStore(), {
      userId: USER,
      periodKey: PERIOD,
      meter: "call_minutes",
      sourceType: "voice_call",
      sourceId: "older-arrival",
      quantity: 200,
      occurredAt: new Date(NOW.getTime() - 60_000),
    });
    const send = vi.fn().mockResolvedValue(undefined);
    await reportPendingUsageForUser(createUsageStore(), { send }, USER, NOW);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: "usage:call_minutes:voice_call:already-attempted",
        value: 2000,
      }),
    );
    const row = (
      await pool.query(
        "SELECT status, billable_quantity FROM wireline_usage_meter_events WHERE source_id = 'older-arrival'",
      )
    ).rows[0];
    expect(row).toEqual({ status: "skipped", billable_quantity: "0.0000" });
  });

  it("isolates period snapshots by tenant and deletes them with the owner", async () => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE wireline_server");
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [USER]);
      expect((await client.query("SELECT * FROM wireline_usage_billing_periods")).rowCount).toBe(1);
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [OTHER]);
      expect((await client.query("SELECT * FROM wireline_usage_billing_periods")).rowCount).toBe(0);
      await expect(
        client.query(
          `INSERT INTO wireline_usage_billing_periods
        (user_id, period_key, stripe_customer_id, stripe_subscription_id, starts_at, ends_at, monthly_cap_usd, number_addons, email_address_addons)
        VALUES ($1, 'cross-tenant', 'cus', 'sub', now(), now() + interval '1 month', 100, 0, 0)`,
          [USER],
        ),
      ).rejects.toThrow("row-level security");
    } finally {
      await client.query("ROLLBACK");
      client.release();
    }
    await pool.query("DELETE FROM wireline_users WHERE id = $1", [USER]);
    expect(
      (await pool.query("SELECT count(*) FROM wireline_usage_billing_periods")).rows[0].count,
    ).toBe("0");
  });

  it("serializes wholesale Computer reservations even when the legacy AI cap is disabled", async () => {
    const { reservePlatformCostRecord } = await import("../src/middleware/audit-middleware");
    await pool.query("INSERT INTO wireline_spend_budgets VALUES ($1, 9999, false, false)", [USER]);
    const reserve = (key: string) =>
      reservePlatformCostRecord({
        userId: USER,
        action: "computer.browse",
        provider: "openai",
        model: "test",
        costUsd: 2,
        idempotencyKey: key,
        requestMeta: { usage_metered: true },
      });
    const results = await Promise.all([reserve("computer-a"), reserve("computer-b")]);
    expect(results.filter((result) => result.reserved)).toHaveLength(1);
    expect(results.filter((result) => !result.reserved)).toEqual([
      expect.objectContaining({ reason: "cap_reached", monthlyLimitUsd: 3 }),
    ]);
    const acceptedKey = results[0].reserved ? "computer-a" : "computer-b";
    expect(await reserve(acceptedKey)).toMatchObject({
      reserved: true,
      reservation: { adopted: true },
    });
    expect(
      (await pool.query("SELECT sum(cost_usd) AS total FROM wireline_audit_log")).rows[0].total,
    ).toBe("2.000000");
    await pool.query(
      "UPDATE wireline_usage_billing_periods SET blocked_reason='review' WHERE user_id=$1",
      [USER],
    );
    expect(await reserve("computer-after-hold")).toMatchObject({
      reserved: false,
      reason: "unavailable",
    });
  });
});
