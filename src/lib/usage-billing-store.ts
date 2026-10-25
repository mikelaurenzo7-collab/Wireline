/**
 * Postgres store and Stripe meter client for the usage billing ledger.
 *
 * New usage admission requires `USAGE_BILLING_ENABLED`. Settlement continues
 * when enrollment/work is paused. Receipts
 * from previously admitted work retain their original billing identity and
 * remain recoverable independently of the task/email process.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import * as schema from "../db/schema";
import {
  usageBillingPeriods,
  usageMeterEvents,
  usageSpendControls,
} from "../db/usage-billing-schema";
import { AppError } from "./api-error";
import { drizzle, log } from "./server-context";
import { isUsagePlanId } from "./plan-catalog";
import { USAGE_DEFAULT_MONTHLY_CAP_USD, type UsageMeterKey } from "./usage-billing-catalog";
import { usageBillingEnabled } from "./usage-billing-config";
import {
  admitUsage,
  emptyMeterTotals,
  evaluateUsageSpendAlerts,
  recordUsageEvent,
  reportPendingUsageForUser,
  usageSpendState,
  validateUsageMonthlyCap,
  usageIdempotencyKey,
  type MeterTotals,
  type UsageEventRow,
  type UsageMeterClient,
  type UsageStore,
} from "./usage-billing-ledger";

type Reader = Pick<typeof drizzle, "select" | "insert" | "update" | "execute">;
type ReportTransaction = <T>(work: (reader: Reader) => Promise<T>) => Promise<T>;

function totalsFromRows(
  rows: Array<{ meter: string; total: string | number | null }>,
): MeterTotals {
  const totals = emptyMeterTotals();
  for (const row of rows) {
    if (row.meter in totals) totals[row.meter as UsageMeterKey] = Number(row.total ?? 0);
  }
  return totals;
}

/** Subscription identity plus the exact Stripe boundary. Never invent a calendar period. */
export function usagePeriodKey(
  currentPeriodEnd: Date | null | undefined,
  stripeSubscriptionId: string | null | undefined,
): string {
  return currentPeriodEnd && Number.isFinite(currentPeriodEnd.getTime()) && stripeSubscriptionId
    ? `${stripeSubscriptionId}:pe:${currentPeriodEnd.toISOString()}`
    : "";
}

export function createUsageStore(
  reader: Reader = drizzle,
  reportTransaction: ReportTransaction = (work) => drizzle.transaction(work),
): UsageStore {
  return {
    async insertEvent(event) {
      const rows = await reader
        .insert(usageMeterEvents)
        .values({
          userId: event.userId,
          periodKey: event.periodKey,
          meter: event.meter,
          sourceType: event.sourceType,
          sourceId: event.sourceId,
          idempotencyKey: event.idempotencyKey,
          quantity: String(event.quantity),
          occurredAt: event.occurredAt,
        })
        .onConflictDoNothing({ target: usageMeterEvents.idempotencyKey })
        .returning({ id: usageMeterEvents.id });
      return rows.length > 0;
    },
    async pendingEvents(userId, limit) {
      const rows = await reader
        .select()
        .from(usageMeterEvents)
        .where(and(eq(usageMeterEvents.userId, userId), eq(usageMeterEvents.status, "pending")))
        .orderBy(
          asc(usageMeterEvents.occurredAt),
          asc(usageMeterEvents.createdAt),
          asc(usageMeterEvents.id),
        )
        .limit(limit);
      return rows.map((row): UsageEventRow => ({
        id: row.id,
        userId: row.userId,
        periodKey: row.periodKey,
        meter: row.meter as UsageMeterKey,
        sourceType: row.sourceType,
        sourceId: row.sourceId,
        idempotencyKey: row.idempotencyKey,
        quantity: Number(row.quantity),
        occurredAt: row.occurredAt,
        status: row.status,
        attempts: row.attempts,
        reportAttempt: row.reportAttempt,
      }));
    },
    async reportedTotals(userId, periodKey) {
      const rows = await reader
        .select({
          meter: usageMeterEvents.meter,
          total: sql<string>`coalesce(sum(${usageMeterEvents.billableQuantity}), 0)`,
        })
        .from(usageMeterEvents)
        .where(
          and(
            eq(usageMeterEvents.userId, userId),
            eq(usageMeterEvents.periodKey, periodKey),
            sql`${usageMeterEvents.status} IN ('pending', 'reported', 'reconciliation_required')`,
          ),
        )
        .groupBy(usageMeterEvents.meter);
      return totalsFromRows(rows);
    },
    async recordedTotals(userId, periodKey) {
      const rows = await reader
        .select({
          meter: usageMeterEvents.meter,
          total: sql<string>`coalesce(sum(coalesce(${usageMeterEvents.billableQuantity}, ${usageMeterEvents.quantity})), 0)`,
        })
        .from(usageMeterEvents)
        .where(
          and(
            eq(usageMeterEvents.userId, userId),
            eq(usageMeterEvents.periodKey, periodKey),
            sql`${usageMeterEvents.status} IN ('pending', 'reported', 'reconciliation_required')`,
          ),
        )
        .groupBy(usageMeterEvents.meter);
      return totalsFromRows(rows);
    },
    async spendControl(userId) {
      const [row] = await reader
        .select()
        .from(usageSpendControls)
        .where(eq(usageSpendControls.userId, userId))
        .limit(1);
      return {
        capUsd: row ? Number(row.monthlyCapUsd) : USAGE_DEFAULT_MONTHLY_CAP_USD,
        numbers: row?.numberAddons ?? 0,
        emailAddresses: row?.emailAddressAddons ?? 0,
        alertPeriodKey: row?.alertPeriodKey ?? null,
        alertLevelPct: row?.alertLevelPct ?? 0,
      };
    },
    async billingIdentity(userId) {
      const [row] = await reader
        .select({
          customerId: schema.subscriptions.stripeCustomerId,
          subscriptionId: schema.subscriptions.stripeSubscriptionId,
          plan: schema.subscriptions.plan,
          status: schema.subscriptions.status,
          periodEnd: schema.subscriptions.currentPeriodEnd,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, userId))
        .limit(1);
      return {
        stripeCustomerId: row?.customerId ?? null,
        periodKey: usagePeriodKey(row?.periodEnd, row?.subscriptionId),
        usagePlanActive:
          isUsagePlanId(row?.plan) && ["active", "trialing"].includes(row?.status ?? ""),
      };
    },
    async billingPeriod(userId, periodKey) {
      const [row] = await reader
        .select()
        .from(usageBillingPeriods)
        .where(
          and(eq(usageBillingPeriods.userId, userId), eq(usageBillingPeriods.periodKey, periodKey)),
        )
        .limit(1);
      return row
        ? {
            capUsd: Number(row.monthlyCapUsd),
            numbers: row.numberAddons,
            emailAddresses: row.emailAddressAddons,
            alertPeriodKey: null,
            alertLevelPct: 0,
            stripeCustomerId: row.stripeCustomerId,
            startsAt: row.startsAt,
            endsAt: row.endsAt,
            blockedReason: row.blockedReason,
          }
        : null;
    },
    async withReportLock(userId, work) {
      // Never call this from another open transaction: the returned preparation
      // must already be committed before the caller contacts Stripe.
      return reportTransaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`usage-report:${userId}`}))`);
        return work(createUsageStore(tx, reportTransaction));
      });
    },
    async prepareReport(id, attempt) {
      await reader
        .update(usageMeterEvents)
        .set({
          reportAttempt: attempt,
          billableQuantity: String(attempt.value),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(usageMeterEvents.id, id),
            eq(usageMeterEvents.status, "pending"),
            sql`${usageMeterEvents.reportAttempt} IS NULL`,
          ),
        );
    },
    async holdForReconciliation(id, reason) {
      await reader
        .update(usageMeterEvents)
        .set({
          status: "reconciliation_required",
          lastError: reason,
          updatedAt: new Date(),
        })
        .where(and(eq(usageMeterEvents.id, id), eq(usageMeterEvents.status, "pending")));
    },
    async markReported(id, billableQuantity) {
      await reader
        .update(usageMeterEvents)
        .set({
          status: "reported",
          billableQuantity: String(billableQuantity),
          reportedAt: new Date(),
          attempts: sql`${usageMeterEvents.attempts} + 1`,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(and(eq(usageMeterEvents.id, id), eq(usageMeterEvents.status, "pending")));
    },
    async markSkipped(id, reason) {
      await reader
        .update(usageMeterEvents)
        .set({
          status: "skipped",
          billableQuantity: "0",
          lastError: reason,
          updatedAt: new Date(),
        })
        .where(and(eq(usageMeterEvents.id, id), eq(usageMeterEvents.status, "pending")));
    },
    async markFailed(id, error) {
      await reader
        .update(usageMeterEvents)
        .set({
          attempts: sql`${usageMeterEvents.attempts} + 1`,
          lastError: error.slice(0, 500),
          updatedAt: new Date(),
        })
        .where(and(eq(usageMeterEvents.id, id), eq(usageMeterEvents.status, "pending")));
    },
    async setAlertLevel(userId, periodKey, levelPct, paused) {
      await reader
        .insert(usageSpendControls)
        .values({
          userId,
          alertPeriodKey: periodKey,
          alertLevelPct: levelPct,
          pausedAt: paused ? new Date() : null,
        })
        .onConflictDoUpdate({
          target: usageSpendControls.userId,
          set: {
            alertPeriodKey: periodKey,
            alertLevelPct: levelPct,
            pausedAt: paused ? new Date() : null,
            updatedAt: new Date(),
          },
        });
    },
  };
}

/** Retries use a frozen request and stay inside Stripe's identifier retention window. */
export function createStripeMeterClient(): UsageMeterClient {
  return {
    async send(event) {
      const { stripe } = await import("./stripe-helpers");
      try {
        await stripe.billing.meterEvents.create({
          event_name: event.eventName,
          identifier: event.identifier,
          timestamp: Math.floor(event.timestamp.getTime() / 1000),
          payload: {
            stripe_customer_id: event.stripeCustomerId,
            value: String(event.value),
          },
        });
      } catch (error) {
        // A duplicate identifier means Stripe already has this exact event.
        const message = error instanceof Error ? error.message : String(error);
        if (/identifier/i.test(message) && /already/i.test(message)) return;
        throw error;
      }
    },
  };
}

async function usageAccount(
  userId: string,
  reader: Pick<Reader, "select"> = drizzle,
): Promise<boolean> {
  if (!userId) return false;
  const [row] = await reader
    .select({ plan: schema.subscriptions.plan, status: schema.subscriptions.status })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  return isUsagePlanId(row?.plan) && ["active", "trialing"].includes(row?.status ?? "");
}

/** True when the account's work is billed through usage meters. */
export async function isUsageBillingAccount(userId: string): Promise<boolean> {
  return usageAccount(userId);
}

/** Admission for new metered work on a usage account; null means not a usage account. */
export async function admitAccountUsage(
  userId: string,
  meter: UsageMeterKey,
  reader: Reader = drizzle,
): Promise<{ maxUnits: number | null; periodKey: string } | null> {
  if (!(await usageAccount(userId, reader))) return null;
  if (!usageBillingEnabled())
    throw AppError.serviceUnavailable("Usage work is temporarily paused.");
  const { maxUnits, state } = await admitUsage(createUsageStore(reader), userId, meter);
  return { maxUnits, periodKey: state.periodKey };
}

/** Persist the call's period before accepting the provider. No wallet debit is involved. */
export async function admitVoiceUsage(
  reader: Reader,
  userId: string,
  sourceId: string,
): Promise<void> {
  const key = usageIdempotencyKey("call_minutes", "voice_call", sourceId);
  const [existing] = await reader
    .select({ status: usageMeterEvents.status })
    .from(usageMeterEvents)
    .where(and(eq(usageMeterEvents.userId, userId), eq(usageMeterEvents.idempotencyKey, key)))
    .limit(1);
  if (existing) {
    if (existing.status !== "admitted")
      throw new AppError(409, "VOICE_FUNDING_SETTLED", "This call has already been settled.");
    return;
  }
  const admission = await admitAccountUsage(userId, "call_minutes", reader);
  if (!admission) throw AppError.serviceUnavailable("Call billing could not be confirmed.");
  await reader
    .insert(usageMeterEvents)
    .values({
      userId,
      periodKey: admission.periodKey,
      meter: "call_minutes",
      sourceType: "voice_call",
      sourceId,
      idempotencyKey: key,
      quantity: "0",
      status: "admitted",
      occurredAt: new Date(),
    })
    .onConflictDoNothing({ target: usageMeterEvents.idempotencyKey });
}

/** First terminal duration wins, even after cancellation, renewal or an emergency pause. */
export async function settleVoiceUsageReceipt(
  userId: string,
  sourceId: string,
  seconds: number,
  reader: Reader = drizzle,
): Promise<boolean> {
  if (!Number.isFinite(seconds) || seconds < 0) throw new Error("Invalid call duration.");
  const key = usageIdempotencyKey("call_minutes", "voice_call", sourceId);
  const [existing] = await reader
    .select({ id: usageMeterEvents.id })
    .from(usageMeterEvents)
    .where(and(eq(usageMeterEvents.userId, userId), eq(usageMeterEvents.idempotencyKey, key)))
    .limit(1);
  if (!existing) return false;
  await reader
    .update(usageMeterEvents)
    .set({
      quantity: String(Math.floor((seconds / 60) * 10_000) / 10_000),
      status: "pending",
      updatedAt: new Date(),
    })
    .where(and(eq(usageMeterEvents.id, existing.id), eq(usageMeterEvents.status, "admitted")));
  return true;
}

export async function accountUsageSpendState(userId: string) {
  if (!(await usageAccount(userId))) return null;
  return usageSpendState(createUsageStore(), userId);
}

export type DurableUsageReceipt = { periodKey: string; quantity: number; occurredAt: string };

/** A receipt captures admission identity and time; settlement must not reclassify it. */
export async function recordSettledUsageReceipt(input: {
  userId: string;
  meter: UsageMeterKey;
  sourceType: string;
  sourceId: string;
  receipt: DurableUsageReceipt;
}): Promise<void> {
  await recordUsageEvent(createUsageStore(), {
    userId: input.userId,
    meter: input.meter,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    periodKey: input.receipt.periodKey,
    quantity: input.receipt.quantity,
    occurredAt: new Date(input.receipt.occurredAt),
  });
}

/** Repair receipts whose immediate meter write failed or died with the process. */
export async function reconcileUsageReceipts(
  limit = 200,
  reader: Pick<Reader, "select"> = drizzle,
  recordReceipt = recordSettledUsageReceipt,
): Promise<void> {
  const computers = await reader
    .select({
      userId: schema.computerTasks.userId,
      sourceId: schema.computerTasks.id,
      receipt: schema.computerTasks.usageReceipt,
    })
    .from(schema.computerTasks)
    .where(
      sql`${schema.computerTasks.usageReceipt} IS NOT NULL AND NOT EXISTS (SELECT 1 FROM ${usageMeterEvents} WHERE ${usageMeterEvents.idempotencyKey} = 'usage:computer_minutes:computer_task:' || ${schema.computerTasks.id}::text)`,
    )
    .orderBy(asc(schema.computerTasks.finishedAt))
    .limit(limit);
  for (const row of computers) {
    if (row.receipt)
      await recordReceipt({
        ...row,
        receipt: row.receipt,
        meter: "computer_minutes",
        sourceType: "computer_task",
      });
  }
  const emails = await reader
    .select({
      userId: schema.auditLog.userId,
      sourceId: schema.auditLog.resourceId,
      receipt: sql<DurableUsageReceipt>`${schema.auditLog.metadata}->'usageReceipt'`,
    })
    .from(schema.auditLog)
    .where(
      sql`${schema.auditLog.userId} IS NOT NULL AND ${schema.auditLog.resourceId} IS NOT NULL AND ${schema.auditLog.eventType} = 'email.thread_reply' AND ${schema.auditLog.metadata}->>'status' = 'sent' AND ${schema.auditLog.metadata}->'usageReceipt' IS NOT NULL AND ${schema.auditLog.metadata}->'usageReceipt' <> 'null'::jsonb AND NOT EXISTS (SELECT 1 FROM ${usageMeterEvents} WHERE ${usageMeterEvents.idempotencyKey} = 'usage:emails_handled:email_reply:' || ${schema.auditLog.resourceId})`,
    )
    .orderBy(asc(schema.auditLog.createdAt))
    .limit(limit);
  for (const row of emails) {
    if (row.userId && row.sourceId && row.receipt)
      await recordReceipt({
        userId: row.userId,
        sourceId: row.sourceId,
        receipt: row.receipt,
        meter: "emails_handled",
        sourceType: "email_reply",
      });
  }
}

async function sendUsageSpendAlert(
  userId: string,
  periodKey: string,
  alert: { thresholdPct: number; spentUsd: number; capUsd: number },
): Promise<void> {
  const [user] = await drizzle
    .select({ email: schema.users.email })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (!user?.email) throw new Error("Usage spend alert recipient is unavailable");
  const { sendUsageSpendAlertEmail } = await import("./email-service");
  const result = await sendUsageSpendAlertEmail({
    userId,
    to: user.email,
    thresholdPct: alert.thresholdPct,
    spentUsd: alert.spentUsd,
    capUsd: alert.capUsd,
    idempotencyKey: `usage-spend-alert:${userId}:${periodKey}:${alert.thresholdPct}`,
  });
  if (!result.ok || result.disposition !== "accepted")
    throw new Error("Usage spend alert was not accepted by the email service");
}

/** Report every account with pending usage. Serialized per account by advisory lock. */
export async function reportAllPendingUsage(limitAccounts = 200): Promise<{
  accounts: number;
  reported: number;
  skipped: number;
  failed: number;
}> {
  const totals = { accounts: 0, reported: 0, skipped: 0, failed: 0 };
  await reconcileUsageReceipts();
  const users = await drizzle
    .selectDistinct({ userId: usageMeterEvents.userId })
    .from(usageMeterEvents)
    .where(eq(usageMeterEvents.status, "pending"))
    .limit(limitAccounts);
  const client = createStripeMeterClient();
  for (const { userId } of users) {
    const result = await reportPendingUsageForUser(createUsageStore(), client, userId);
    totals.accounts += 1;
    totals.reported += result.reported;
    totals.skipped += result.skipped;
    totals.failed += result.failed;
  }
  // Include accounts with fully reported receipts: a failed alert cannot rely
  // on another purchase or meter event to become eligible for retry.
  const alertUsers = await drizzle
    .select({ userId: usageSpendControls.userId })
    .from(usageSpendControls)
    .innerJoin(schema.subscriptions, eq(schema.subscriptions.userId, usageSpendControls.userId))
    .where(
      and(
        eq(schema.subscriptions.plan, "usage"),
        sql`${schema.subscriptions.status} IN ('active', 'trialing')`,
      ),
    )
    .orderBy(asc(usageSpendControls.updatedAt))
    .limit(limitAccounts);
  for (const { userId } of alertUsers) {
    await drizzle.transaction(async (tx) => {
      const lock = (await tx.execute(
        sql`SELECT pg_try_advisory_xact_lock(hashtext(${`usage-report:${userId}`})) AS locked`,
      )) as unknown as { rows?: Array<{ locked: boolean }> };
      if (lock.rows?.[0]?.locked === false) return;
      const store = createUsageStore(tx);
      const identity = await store.billingIdentity(userId);
      try {
        await evaluateUsageSpendAlerts(store, userId, (alert) =>
          sendUsageSpendAlert(userId, identity.periodKey, alert),
        );
      } catch (error) {
        totals.failed += 1;
        log.warn("Usage spend alert delivery will retry", {
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      // Rotate the bounded sweep fairly, including transport failures.
      await tx
        .update(usageSpendControls)
        .set({ updatedAt: new Date() })
        .where(eq(usageSpendControls.userId, userId));
    });
  }
  return totals;
}

/** Serialize cap changes with Stripe reports; never erase accrued charges. */
export async function setUsageMonthlyCap(userId: string, capUsd: number): Promise<void> {
  await drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`usage-report:${userId}`}))`);
    const store = createUsageStore(tx);
    const identity = await store.billingIdentity(userId);
    const control = await store.billingPeriod(userId, identity.periodKey);
    if (
      !control ||
      !identity.usagePlanActive ||
      control.blockedReason ||
      new Date() < control.startsAt ||
      new Date() >= control.endsAt
    )
      throw AppError.serviceUnavailable("Your billing period is still being confirmed.");
    const state = await usageSpendState(store, userId);
    validateUsageMonthlyCap(control, state.spentUsd, capUsd);
    await tx
      .update(usageBillingPeriods)
      .set({ monthlyCapUsd: capUsd.toFixed(2) })
      .where(
        and(
          eq(usageBillingPeriods.userId, userId),
          eq(usageBillingPeriods.periodKey, identity.periodKey),
        ),
      );
    await tx
      .insert(usageSpendControls)
      .values({ userId, monthlyCapUsd: capUsd.toFixed(2) })
      .onConflictDoUpdate({
        target: usageSpendControls.userId,
        set: {
          monthlyCapUsd: capUsd.toFixed(2),
          // Raising the cap clears the pause; the next alert re-evaluates the level.
          pausedAt: null,
          alertLevelPct: sql`CASE WHEN ${usageSpendControls.alertLevelPct} >= 100 THEN 80 ELSE ${usageSpendControls.alertLevelPct} END`,
          updatedAt: new Date(),
        },
      });
  });
}

/** Mirror add-on quantities from the Stripe subscription items. */
export async function setUsageAddonQuantities(
  userId: string,
  quantities: { numbers: number; emailAddresses: number },
  period: {
    stripeCustomerId: string;
    stripeSubscriptionId: string;
    startsAt: Date | null;
    endsAt: Date | null;
  },
): Promise<void> {
  if (!period.startsAt || !period.endsAt || !(period.endsAt > period.startsAt))
    throw AppError.serviceUnavailable("The Stripe billing period is unavailable.");
  const periodKey = usagePeriodKey(period.endsAt, period.stripeSubscriptionId);
  await drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`usage-report:${userId}`}))`);
    const control = await createUsageStore(tx).spendControl(userId);
    await tx
      .insert(usageBillingPeriods)
      .values({
        userId,
        periodKey,
        stripeCustomerId: period.stripeCustomerId,
        stripeSubscriptionId: period.stripeSubscriptionId,
        startsAt: period.startsAt!,
        endsAt: period.endsAt!,
        monthlyCapUsd: control.capUsd.toFixed(2),
        numberAddons: quantities.numbers,
        emailAddressAddons: quantities.emailAddresses,
      })
      .onConflictDoUpdate({
        target: [usageBillingPeriods.userId, usageBillingPeriods.periodKey],
        set: {
          // Proration cannot be reconstructed from the latest quantities. Keep the
          // original snapshot and require invoice reconciliation if they change.
          blockedReason: sql`CASE WHEN ${usageBillingPeriods.numberAddons} <> ${quantities.numbers}
        OR ${usageBillingPeriods.emailAddressAddons} <> ${quantities.emailAddresses}
        OR ${usageBillingPeriods.startsAt} <> ${period.startsAt}
        OR ${usageBillingPeriods.stripeCustomerId} <> ${period.stripeCustomerId}
        THEN 'subscription_change_requires_invoice_reconciliation' ELSE ${usageBillingPeriods.blockedReason} END`,
        },
      });
    await tx
      .insert(usageSpendControls)
      .values({
        userId,
        numberAddons: quantities.numbers,
        emailAddressAddons: quantities.emailAddresses,
      })
      .onConflictDoUpdate({
        target: usageSpendControls.userId,
        set: {
          numberAddons: quantities.numbers,
          emailAddressAddons: quantities.emailAddresses,
          updatedAt: new Date(),
        },
      });
  });
}

/**
 * Paid identity slots on the usage plan. Numbers and BotBound email addresses
 * exist only as add-ons the owner chose, so nothing is provisioned without one.
 * Zero while the flag is off, so a dark launch never provisions anything.
 */
export async function usageAddonSlots(
  userId: string,
  executor: Pick<typeof drizzle, "select"> = drizzle,
): Promise<{ numbers: number; emailAddresses: number }> {
  if (!usageBillingEnabled()) return { numbers: 0, emailAddresses: 0 };
  const [row] = await executor
    .select({
      numbers: usageSpendControls.numberAddons,
      emailAddresses: usageSpendControls.emailAddressAddons,
    })
    .from(usageSpendControls)
    .where(eq(usageSpendControls.userId, userId))
    .limit(1);
  return {
    numbers: Math.max(0, Number(row?.numbers ?? 0)),
    emailAddresses: Math.max(0, Number(row?.emailAddresses ?? 0)),
  };
}
