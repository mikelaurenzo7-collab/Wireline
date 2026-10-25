import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  USAGE_REPORT_MAX_AGE_MS,
  USAGE_REPORT_RETRY_WINDOW_MS,
  UsageSpendCapReachedError,
  admitUsage,
  clampBillableQuantity,
  emptyMeterTotals,
  evaluateUsageSpendAlerts,
  periodSpendUsd,
  recordUsageEvent,
  reportPendingUsageForUser,
  usageIdempotencyKey,
  usageSpendState,
  validateUsageMonthlyCap,
  type MeterTotals,
  type UsageBillingIdentity,
  type UsageBillingPeriod,
  type UsageEventRow,
  type UsageMeterClient,
  type UsageSpendControl,
  type UsageStore,
} from "../src/lib/usage-billing-ledger";
import type { UsageMeterKey } from "../src/lib/usage-billing-catalog";

const USER = "user-1";
const PERIOD = "2026-11-01";
const NOW = new Date("2026-10-24T12:00:00Z");

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW.getTime());
});
afterEach(() => {
  vi.restoreAllMocks();
});

type Row = UsageEventRow & { billable: number | null; reason: string | null };

function memoryStore(
  options: {
    control?: Partial<UsageSpendControl>;
    identity?: Partial<UsageBillingIdentity>;
  } = {},
) {
  const rows: Row[] = [];
  const control: UsageSpendControl = {
    capUsd: 100,
    numbers: 0,
    emailAddresses: 0,
    alertPeriodKey: null,
    alertLevelPct: 0,
    ...options.control,
  };
  const identity: UsageBillingIdentity = {
    stripeCustomerId: "cus_test_owner",
    periodKey: PERIOD,
    usagePlanActive: true,
    ...options.identity,
  };
  const paused: boolean[] = [];
  const period: UsageBillingPeriod = {
    ...control,
    stripeCustomerId: "cus_test_owner",
    startsAt: new Date("2026-10-01T00:00:00Z"),
    endsAt: new Date("2026-11-01T00:00:00Z"),
    blockedReason: null,
  };
  const periods = new Map([[PERIOD, period]]);
  let lock = Promise.resolve();
  const sum = (filter: (row: Row) => boolean, value: (row: Row) => number): MeterTotals => {
    const totals = emptyMeterTotals();
    for (const row of rows.filter(filter)) totals[row.meter] += value(row);
    return totals;
  };
  const store: UsageStore = {
    async insertEvent(event) {
      if (rows.some((row) => row.idempotencyKey === event.idempotencyKey)) return false;
      rows.push({
        ...event,
        id: `row-${rows.length + 1}`,
        status: "pending",
        attempts: 0,
        billable: null,
        reason: null,
        reportAttempt: null,
      });
      return true;
    },
    async pendingEvents(userId, limit) {
      return rows
        .filter((row) => row.userId === userId && row.status === "pending")
        .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
        .slice(0, limit);
    },
    async reportedTotals(userId, periodKey) {
      return sum(
        (row) =>
          row.userId === userId &&
          row.periodKey === periodKey &&
          ["pending", "reported", "reconciliation_required"].includes(row.status),
        (row) => row.billable ?? 0,
      );
    },
    async recordedTotals(userId, periodKey) {
      return sum(
        (row) =>
          row.userId === userId &&
          row.periodKey === periodKey &&
          ["pending", "reported", "reconciliation_required"].includes(row.status),
        (row) => row.billable ?? row.quantity,
      );
    },
    async spendControl() {
      return { ...control };
    },
    async billingIdentity() {
      return { ...identity };
    },
    async billingPeriod(_userId, key) {
      return periods.get(key) ?? null;
    },
    async withReportLock(_userId, work) {
      const previous = lock;
      let release!: () => void;
      lock = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await work(store);
      } finally {
        release();
      }
    },
    async prepareReport(id, attempt) {
      const row = rows.find((candidate) => candidate.id === id)!;
      row.reportAttempt = { ...attempt };
      row.billable = attempt.nativeQuantity;
    },
    async holdForReconciliation(id, reason) {
      const row = rows.find((candidate) => candidate.id === id)!;
      row.status = "reconciliation_required";
      row.reason = reason;
    },
    async markReported(id, billable) {
      const row = rows.find((candidate) => candidate.id === id)!;
      row.status = "reported";
      row.billable = billable;
    },
    async markSkipped(id, reason) {
      const row = rows.find((candidate) => candidate.id === id)!;
      row.status = "skipped";
      row.reason = reason;
    },
    async markFailed(id) {
      rows.find((candidate) => candidate.id === id)!.attempts += 1;
    },
    async setAlertLevel(_userId, periodKey, level, isPaused) {
      control.alertPeriodKey = periodKey;
      control.alertLevelPct = level;
      paused.push(isPaused);
    },
  };
  return { store, rows, control, paused, identity, period, periods };
}

function event(meter: UsageMeterKey, sourceId: string, quantity: number, occurredAt = NOW) {
  return {
    userId: USER,
    periodKey: PERIOD,
    meter,
    sourceType: meter === "call_minutes" ? "voice_call" : "task",
    sourceId,
    quantity,
    occurredAt,
  };
}

function recordingClient() {
  const sent: Parameters<UsageMeterClient["send"]>[0][] = [];
  const client: UsageMeterClient = {
    send: vi.fn(async (payload) => {
      sent.push(payload);
    }),
  };
  return { client, sent };
}

describe("usage metering idempotency", () => {
  it("records one unit of work once, however often it is replayed", async () => {
    const { store, rows } = memoryStore();
    const first = await recordUsageEvent(store, event("call_minutes", "call-1", 3.5));
    const replay = await recordUsageEvent(store, event("call_minutes", "call-1", 3.5));
    expect(first).toEqual({
      recorded: true,
      idempotencyKey: "usage:call_minutes:voice_call:call-1",
    });
    expect(replay.recorded).toBe(false);
    expect(rows).toHaveLength(1);
  });

  it("keys each meter separately and refuses unstable sources", () => {
    expect(usageIdempotencyKey("emails_handled", "email_reply", "m-1")).not.toBe(
      usageIdempotencyKey("computer_minutes", "email_reply", "m-1"),
    );
    expect(() => usageIdempotencyKey("call_minutes", "voice_call", "")).toThrow();
    expect(() => usageIdempotencyKey("call_minutes", "voice_call", "unknown")).toThrow();
    expect(() => usageIdempotencyKey("call_minutes", " ", "call-1")).toThrow();
  });

  it("rejects negative or non-finite quantities and floors to 4 decimals", async () => {
    const { store, rows } = memoryStore();
    await expect(recordUsageEvent(store, event("call_minutes", "a", -1))).rejects.toThrow();
    await expect(recordUsageEvent(store, event("call_minutes", "b", Number.NaN))).rejects.toThrow();
    await recordUsageEvent(store, event("call_minutes", "c", 1.234567));
    expect(rows[0].quantity).toBe(1.2345);
  });

  it("reports with the idempotency key as the Stripe identifier and never resends", async () => {
    const { store, rows } = memoryStore();
    const { client, sent } = recordingClient();
    await recordUsageEvent(store, event("call_minutes", "call-1", 70));
    expect(await reportPendingUsageForUser(store, client, USER, NOW)).toEqual({
      reported: 1,
      skipped: 0,
      failed: 0,
    });
    expect(await reportPendingUsageForUser(store, client, USER, NOW)).toEqual({
      reported: 0,
      skipped: 0,
      failed: 0,
    });
    expect(sent).toEqual([
      {
        meter: "call_minutes",
        eventName: "botbound_work_credits_v2",
        stripeCustomerId: "cus_test_owner",
        value: 1750,
        identifier: "usage:call_minutes:voice_call:call-1",
        timestamp: NOW,
      },
    ]);
    expect(rows[0].status).toBe("reported");
  });

  it("stops the batch on a Stripe failure and retries the same identifier later", async () => {
    const { store, rows } = memoryStore();
    await recordUsageEvent(
      store,
      event("call_minutes", "call-1", 5, new Date(NOW.getTime() - 2000)),
    );
    await recordUsageEvent(
      store,
      event("call_minutes", "call-2", 5, new Date(NOW.getTime() - 1000)),
    );
    const failing: UsageMeterClient = { send: vi.fn().mockRejectedValue(new Error("timeout")) };
    expect(await reportPendingUsageForUser(store, failing, USER, NOW)).toEqual({
      reported: 0,
      skipped: 0,
      failed: 1,
    });
    expect(failing.send).toHaveBeenCalledTimes(1);
    expect(rows.map((row) => row.status)).toEqual(["pending", "pending"]);
    const { client, sent } = recordingClient();
    await reportPendingUsageForUser(store, client, USER, NOW);
    expect(sent.map((payload) => payload.identifier)).toEqual([
      "usage:call_minutes:voice_call:call-1",
      "usage:call_minutes:voice_call:call-2",
    ]);
  });
});

describe("usage reconciliation holds", () => {
  it("freezes the entire report before I/O and keeps it unchanged after a timeout and cap change", async () => {
    const { store, rows, period } = memoryStore({ control: { capUsd: 25 } });
    await recordUsageEvent(store, event("call_minutes", "ambiguous", 100));
    const send = vi.fn(async (payload) => {
      expect(rows[0].reportAttempt).toMatchObject({ value: 1800, identifier: payload.identifier });
      throw new Error("response lost");
    });
    await reportPendingUsageForUser(store, { send }, USER, NOW);
    period.capUsd = 100;
    const { client, sent } = recordingClient();
    await reportPendingUsageForUser(store, client, USER, new Date(NOW.getTime() + 60_000));
    expect(sent).toEqual([send.mock.calls[0][0]]);
    expect(rows[0].billable).toBe(72);
  });

  it("never contacts Stripe when request preparation fails", async () => {
    const { store } = memoryStore();
    await recordUsageEvent(store, event("emails_handled", "storage-failure", 5));
    vi.spyOn(store, "prepareReport").mockRejectedValueOnce(new Error("commit unavailable"));
    const { client } = recordingClient();
    await expect(reportPendingUsageForUser(store, client, USER, NOW)).rejects.toThrow(
      "commit unavailable",
    );
    expect(client.send).not.toHaveBeenCalled();
  });

  it("preserves possibly accepted charges after the retry window and reserves their cap headroom", async () => {
    const { store, rows } = memoryStore({ control: { capUsd: 25 } });
    await recordUsageEvent(store, event("call_minutes", "timeout", 100));
    await recordUsageEvent(store, event("call_minutes", "next", 10, new Date(NOW.getTime() + 1)));
    await reportPendingUsageForUser(
      store,
      { send: vi.fn().mockRejectedValue(new Error("timeout")) },
      USER,
      NOW,
    );
    const { client } = recordingClient();
    const result = await reportPendingUsageForUser(
      store,
      client,
      USER,
      new Date(NOW.getTime() + USAGE_REPORT_RETRY_WINDOW_MS),
    );
    expect(result).toEqual({ reported: 0, skipped: 1, failed: 1 });
    expect(rows[0]).toMatchObject({
      status: "reconciliation_required",
      billable: 72,
      reason: "ambiguous_report_beyond_deduplication_window",
    });
    expect(rows[1].reason).toBe("spend_cap");
    expect(client.send).not.toHaveBeenCalled();
  });

  it("holds late prior-period work without applying the new period's higher cap or blocking its report", async () => {
    const { store, rows, period, periods, identity } = memoryStore({ control: { capUsd: 25 } });
    period.endsAt = NOW;
    const nextPeriod = "new-subscription-period";
    periods.set(nextPeriod, {
      ...period,
      startsAt: NOW,
      endsAt: new Date("2026-11-24T12:00:00Z"),
      capUsd: 100,
    });
    identity.periodKey = nextPeriod;
    await recordUsageEvent(
      store,
      event("call_minutes", "late", 100, new Date(NOW.getTime() - 60_000)),
    );
    await recordUsageEvent(store, {
      ...event("call_minutes", "current", 100),
      periodKey: nextPeriod,
    });
    const { client, sent } = recordingClient();
    await reportPendingUsageForUser(store, client, USER, NOW);
    expect(rows[0]).toMatchObject({
      status: "reconciliation_required",
      quantity: 100,
      reason: "closed_period_requires_invoice_reconciliation",
    });
    expect(sent.map((request) => request.identifier)).toEqual([
      "usage:call_minutes:voice_call:current",
    ]);
    expect(period.capUsd).toBe(25);
  });

  it("refuses new work and preserves receipts when an add-on change requires proration reconciliation", async () => {
    const { store, period, rows } = memoryStore();
    period.blockedReason = "subscription_change_requires_invoice_reconciliation";
    await expect(admitUsage(store, USER, "call_minutes")).rejects.toMatchObject({
      statusCode: 503,
    });
    await recordUsageEvent(store, event("call_minutes", "prior-admission", 2));
    const { client } = recordingClient();
    await reportPendingUsageForUser(store, client, USER, NOW);
    expect(rows[0].reason).toBe(period.blockedReason);
    expect(client.send).not.toHaveBeenCalled();
  });

  it("never guesses a period when the Stripe snapshot is missing", async () => {
    const { store, periods } = memoryStore();
    periods.clear();
    await expect(admitUsage(store, USER, "call_minutes")).rejects.toMatchObject({
      statusCode: 503,
    });
  });

  it("refuses admission when the current customer differs from the period snapshot", async () => {
    const { store, identity } = memoryStore();
    identity.stripeCustomerId = "cus_different";
    await expect(admitUsage(store, USER, "call_minutes")).rejects.toMatchObject({
      statusCode: 503,
    });
  });
  it("preserves pending receipts after cancellation for final invoice reconciliation", async () => {
    const { store, rows } = memoryStore({ identity: { usagePlanActive: false } });
    const { client } = recordingClient();
    await recordUsageEvent(store, event("emails_handled", "m-1", 1));
    expect((await reportPendingUsageForUser(store, client, USER, NOW)).failed).toBe(1);
    expect(rows[0]).toMatchObject({
      status: "reconciliation_required",
      quantity: 1,
      reason: "inactive_subscription_requires_final_invoice_reconciliation",
    });
    expect(client.send).not.toHaveBeenCalled();
  });

  it("retains receipts without a Stripe customer", async () => {
    const { store, rows } = memoryStore({ identity: { stripeCustomerId: null } });
    const { client } = recordingClient();
    await recordUsageEvent(store, event("emails_handled", "m-1", 1));
    await reportPendingUsageForUser(store, client, USER, NOW);
    expect(rows[0].reason).toBe("inactive_subscription_requires_final_invoice_reconciliation");
    expect(client.send).not.toHaveBeenCalled();
  });

  it("retains events older than the Stripe meter window", async () => {
    const { store, rows, period } = memoryStore();
    period.startsAt = new Date("2026-09-01T00:00:00Z");
    const { client } = recordingClient();
    const stale = new Date(NOW.getTime() - USAGE_REPORT_MAX_AGE_MS - 1);
    await recordUsageEvent(store, event("emails_handled", "m-1", 1, stale));
    await reportPendingUsageForUser(store, client, USER, NOW);
    expect(rows[0].reason).toBe("older_than_meter_window");
    expect(client.send).not.toHaveBeenCalled();
  });
});

describe("usage spend caps", () => {
  it("consumes one pool across channels and clamps concurrent mixed work to the same cap", async () => {
    const { store, rows } = memoryStore({ control: { capUsd: 24 } });
    const { client, sent } = recordingClient();
    // $6 calls + $2 email + $4 Computer exhaust exactly the shared $12.
    await recordUsageEvent(store, event("call_minutes", "mixed-call", 24));
    await recordUsageEvent(store, event("emails_handled", "mixed-email", 100));
    await recordUsageEvent(store, event("computer_minutes", "mixed-computer", 20));
    await reportPendingUsageForUser(store, client, USER, NOW);
    expect((await usageSpendState(store, USER)).spentUsd).toBe(19);
    expect(sent.reduce((sum, item) => sum + item.value, 0)).toBe(1200);
    await recordUsageEvent(store, event("computer_minutes", "extra-computer", 50));
    await recordUsageEvent(store, event("call_minutes", "extra-call", 5));
    await Promise.all([
      reportPendingUsageForUser(store, client, USER, NOW),
      reportPendingUsageForUser(store, client, USER, NOW),
    ]);
    expect(rows.find((row) => row.sourceId === "extra-computer")?.billable).toBe(25);
    expect(rows.find((row) => row.sourceId === "extra-call")?.status).toBe("skipped");
    expect((await usageSpendState(store, USER)).spentUsd).toBe(24);
  });
  it("refuses a cap below accrued usage and never conceals already-reported charges", async () => {
    const { store, control, period } = memoryStore();
    const { client } = recordingClient();
    await recordUsageEvent(store, event("call_minutes", "call-344", 344));
    let state = await usageSpendState(store, USER);
    expect(state.spentUsd).toBe(93);
    expect(() => validateUsageMonthlyCap(control, state.spentUsd, 24)).toThrow("already accrued");
    expect(() => validateUsageMonthlyCap(control, state.spentUsd, 93)).not.toThrow();
    await reportPendingUsageForUser(store, client, USER, NOW);
    // Even an old invalid cap must not hide Stripe-accepted charges.
    control.capUsd = 24;
    period.capUsd = 24;
    state = await usageSpendState(store, USER);
    expect(state).toMatchObject({ spentUsd: 93, capUsd: 24, atCap: true, headroomUsd: 0 });
  });

  it("shows fixed charges even if an inconsistent add-on projection exceeds the cap", async () => {
    const { store } = memoryStore({ control: { numbers: 20, emailAddresses: 20 } });
    expect(await usageSpendState(store, USER)).toMatchObject({
      spentUsd: 159,
      capUsd: 100,
      atCap: true,
    });
  });
  it("prices fixed charges plus every meter at its period total", () => {
    const control = {
      capUsd: 100,
      numbers: 1,
      emailAddresses: 1,
      alertPeriodKey: null,
      alertLevelPct: 0,
    };
    expect(periodSpendUsd(control, emptyMeterTotals())).toBe(26);
    expect(
      periodSpendUsd(control, {
        call_minutes: 160,
        emails_handled: 150,
        computer_minutes: 25,
        sms_segments: 0,
      }),
    ).toBe(26 + 40 + 3 + 5 - 12);
  });

  it("clamps a report to what the remaining headroom pays for", () => {
    // 60 minutes are included, so 70 minutes from zero cost $2.50.
    expect(clampBillableQuantity("call_minutes", 0, 70, 100)).toBe(70);
    expect(clampBillableQuantity("call_minutes", 60, 10, 1)).toBe(4);
    expect(clampBillableQuantity("call_minutes", 0, 70, 0)).toBe(48);
    expect(clampBillableQuantity("call_minutes", 80, 10, 0)).toBe(0);
    expect(clampBillableQuantity("emails_handled", 0, 0, 10)).toBe(0);
  });

  it("never reports more than the cap, and skips work past it", async () => {
    // $19 base, cap $25: $6 of headroom is 24 paid minutes after the 60 included.
    const { store, rows } = memoryStore({ control: { capUsd: 25 } });
    const { client, sent } = recordingClient();
    await recordUsageEvent(
      store,
      event("call_minutes", "call-1", 50, new Date(NOW.getTime() - 3000)),
    );
    await recordUsageEvent(
      store,
      event("call_minutes", "call-2", 50, new Date(NOW.getTime() - 2000)),
    );
    await recordUsageEvent(
      store,
      event("call_minutes", "call-3", 5, new Date(NOW.getTime() - 1000)),
    );
    const result = await reportPendingUsageForUser(store, client, USER, NOW);
    expect(result).toEqual({ reported: 2, skipped: 1, failed: 0 });
    expect(sent.map((payload) => payload.value)).toEqual([1250, 550]);
    expect(rows[2].reason).toBe("spend_cap");
    const billedMinutes = sent.reduce((total, payload) => total + payload.value / 25, 0);
    expect(
      periodSpendUsd(
        { ...(await store.spendControl(USER)) },
        {
          ...emptyMeterTotals(),
          call_minutes: billedMinutes,
        },
      ),
    ).toBeLessThanOrEqual(25);
  });

  it("admits work with the headroom it can pay for, and refuses at the cap with a 402", async () => {
    const { store } = memoryStore({ control: { capUsd: 25 } });
    const admitted = await admitUsage(store, USER, "call_minutes");
    expect(admitted.maxUnits).toBeCloseTo(48 + 6 / 0.25, 6);
    await recordUsageEvent(store, event("call_minutes", "call-1", 72));
    const state = await usageSpendState(store, USER);
    expect(state).toMatchObject({
      spentUsd: 25,
      capUsd: 25,
      pct: 100,
      atCap: true,
      headroomUsd: 0,
    });
    const refusal = await admitUsage(store, USER, "emails_handled").catch((error) => error);
    expect(refusal).toBeInstanceOf(UsageSpendCapReachedError);
    expect(refusal).toMatchObject({ statusCode: 402, code: "USAGE_SPEND_CAP_REACHED" });
  });

  it("shows recorded spend above the cap as the cap, because it is never billed", async () => {
    const { store } = memoryStore({ control: { capUsd: 30 } });
    await recordUsageEvent(store, event("call_minutes", "long-call", 500));
    expect((await usageSpendState(store, USER)).spentUsd).toBe(30);
  });
});

describe("usage spend alerts", () => {
  it("retries a failed delivery without requiring any additional usage", async () => {
    const { store, control } = memoryStore({ control: { capUsd: 40 } });
    await recordUsageEvent(store, event("call_minutes", "call-alert", 52));
    const notify = vi
      .fn()
      .mockRejectedValueOnce(new Error("transport down"))
      .mockResolvedValue(undefined);
    await expect(evaluateUsageSpendAlerts(store, USER, notify)).rejects.toThrow("transport down");
    expect(control.alertLevelPct).toBe(0);
    expect(await evaluateUsageSpendAlerts(store, USER, notify)).toEqual([50]);
    expect(await evaluateUsageSpendAlerts(store, USER, notify)).toEqual([]);
    expect(notify).toHaveBeenCalledTimes(2);
  });
  it("sends each threshold once per period, the highest only, and pauses at 100%", async () => {
    const { store, paused } = memoryStore({ control: { capUsd: 40 } });
    const notify = vi.fn().mockResolvedValue(undefined);
    // $19 base of a $40 cap is 47%.
    expect(await evaluateUsageSpendAlerts(store, USER, notify)).toEqual([]);
    await recordUsageEvent(store, event("call_minutes", "call-1", 52)); // $20 = 50%
    expect(await evaluateUsageSpendAlerts(store, USER, notify)).toEqual([50]);
    expect(await evaluateUsageSpendAlerts(store, USER, notify)).toEqual([]);
    await recordUsageEvent(store, event("call_minutes", "call-2", 100)); // past 100%
    expect(await evaluateUsageSpendAlerts(store, USER, notify)).toEqual([80, 100]);
    expect(notify.mock.calls.map(([alert]) => alert.thresholdPct)).toEqual([50, 100]);
    expect(paused).toEqual([false, true]);
    expect(await evaluateUsageSpendAlerts(store, USER, notify)).toEqual([]);
  });

  it("starts over in a new period", async () => {
    const { store } = memoryStore({
      control: { capUsd: 30, alertPeriodKey: "2026-10-01", alertLevelPct: 100 },
    });
    const notify = vi.fn().mockResolvedValue(undefined);
    await recordUsageEvent(store, event("call_minutes", "call-1", 52)); // $20 of $30
    expect(await evaluateUsageSpendAlerts(store, USER, notify)).toEqual([50]);
  });
});

describe("Plus period accounting", () => {
  it("admits its allowance and clamps the invoice at the same owner cap", async () => {
    const { store } = memoryStore({ control: { tier: "plus", capUsd: 100 } });
    expect((await admitUsage(store, USER, "call_minutes")).maxUnits).toBe(348);
    await recordUsageEvent(store, event("call_minutes", "plus-call", 144));
    expect(await usageSpendState(store, USER)).toMatchObject({
      tier: "plus",
      includedWorkUsd: 36,
      includedRemainingUsd: 0,
      spentUsd: 49,
    });
    expect(clampBillableQuantity("call_minutes", 0, 1000, 51, emptyMeterTotals(), "plus")).toBe(
      348,
    );
    expect(
      periodSpendUsd(
        {
          tier: "plus",
          capUsd: 100,
          numbers: 0,
          emailAddresses: 0,
          alertPeriodKey: null,
          alertLevelPct: 0,
        },
        { call_minutes: 348, emails_handled: 0, computer_minutes: 0, sms_segments: 0 },
      ),
    ).toBe(100);
  });
  it("does not let the lower Starter minimum override Plus fixed charges", () => {
    expect(() =>
      validateUsageMonthlyCap(
        {
          tier: "plus",
          capUsd: 100,
          numbers: 0,
          emailAddresses: 0,
          alertPeriodKey: null,
          alertLevelPct: 0,
        },
        49,
        24,
      ),
    ).toThrow();
  });
});
