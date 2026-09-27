import type Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { AppError } from "./api-error";
import { planById, type StripePlan } from "./plan-catalog";
import { drizzle } from "./server-context";

type Reader = Pick<typeof drizzle, "select">;
export type AllowanceWindow = { key: string; start: Date; end: Date };
export type PaidAllowanceReceipt = {
  version: 1;
  subscription_id: string;
  customer_id: string;
  price_id: string;
  invoice_id: string;
  plan_id: string;
  interval: "month" | "year";
  period_start: number;
  period_end: number;
};
const RECEIPT_TYPE = "paid_plan_allowance";
const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;

/** Clamp each slice from the original anchor, never from the prior clamped month. */
function anniversary(anchor: Date, months: number): Date {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth() + months;
  const day = Math.min(anchor.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(
    Date.UTC(
      year,
      month,
      day,
      anchor.getUTCHours(),
      anchor.getUTCMinutes(),
      anchor.getUTCSeconds(),
    ),
  );
}

export function calendarAllowanceWindow(now = new Date()): AllowanceWindow {
  return {
    key: now.toISOString().slice(0, 7),
    start: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)),
    end: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
  };
}

export function paidAllowanceWindow(
  receipt: PaidAllowanceReceipt,
  now = new Date(),
): AllowanceWindow | null {
  const start = new Date(receipt.period_start * 1000);
  const end = new Date(receipt.period_end * 1000);
  if (now < start || now >= end) return null;
  if (receipt.interval === "year" && now >= anniversary(start, 12)) return null;
  let sliceStart = start;
  let sliceEnd = end;
  if (receipt.interval === "year") {
    for (let month = 1; month <= 12; month++) {
      const next = new Date(Math.min(anniversary(start, month).getTime(), end.getTime()));
      if (now < next) {
        sliceEnd = next;
        break;
      }
      sliceStart = next;
    }
  }
  return {
    key: `paid:${receipt.subscription_id}:${Math.floor(sliceStart.getTime() / 1000)}`,
    start: sliceStart,
    end: sliceEnd,
  };
}

/** A subscription phase/status alone is not evidence that its allowance was paid. */
export function verifiedPaidAllowanceReceipt(
  sub: Stripe.Subscription,
  plan: StripePlan,
  priceId: string,
  invoice: Stripe.Invoice,
): PaidAllowanceReceipt | null {
  if (plan.catalogFamily !== "channels" || sub.status !== "active") return null;
  const item = sub.items.data.find((candidate) => candidate.price.id === priceId);
  const legacy = sub as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const start = item?.current_period_start ?? legacy.current_period_start;
  const end = item?.current_period_end ?? legacy.current_period_end;
  const interval = item?.price.recurring?.interval;
  const owner =
    invoice.parent?.subscription_details?.subscription ??
    (invoice as Stripe.Invoice & { subscription?: string }).subscription;
  const customer = idOf(sub.customer);
  if (
    !item ||
    item.quantity !== 1 ||
    !customer ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    !(start! > 0) ||
    !(end! > start!) ||
    !["month", "year"].includes(interval ?? "") ||
    item.price.recurring?.interval_count !== 1 ||
    end! - start! > (interval === "year" ? 367 : 32) * 86400 ||
    (interval === "year" && end! * 1000 > anniversary(new Date(start! * 1000), 12).getTime()) ||
    idOf(sub.latest_invoice) !== invoice.id ||
    invoice.status !== "paid" ||
    invoice.amount_remaining !== 0 ||
    idOf(owner) !== sub.id ||
    idOf(invoice.customer) !== customer ||
    invoice.lines.has_more
  )
    return null;
  const paidLine = invoice.lines.data.some((line) => {
    const compat = line as Stripe.InvoiceLineItem & {
      price?: Stripe.Price | string;
      proration?: boolean;
    };
    return (
      idOf(line.pricing?.price_details?.price ?? compat.price) === priceId &&
      !line.parent?.subscription_item_details?.proration &&
      !compat.proration &&
      line.amount > 0 &&
      line.period.start === start &&
      line.period.end === end
    );
  });
  if (!paidLine) return null;
  return {
    version: 1,
    subscription_id: sub.id,
    customer_id: customer,
    price_id: priceId,
    invoice_id: invoice.id,
    plan_id: plan.id,
    interval: interval as "month" | "year",
    period_start: start!,
    period_end: end!,
  };
}

/** Durable billing history, not a wallet grant; survives audit-log retention and Bot deletion. */
export async function recordPaidAllowanceReceipt(
  userId: string,
  receipt: PaidAllowanceReceipt,
): Promise<void> {
  const reference = `${receipt.subscription_id}:${receipt.period_start}`;
  await drizzle.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    const [sum] = await tx
      .select({ balance: sql<string>`COALESCE(SUM(${schema.creditLedger.deltaUsd}), 0)` })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.userId, userId));
    const balance = Number(sum?.balance ?? 0);
    if (!Number.isFinite(balance)) throw allowanceSyncRequired();
    const inserted = await tx
      .insert(schema.creditLedger)
      .values({
        userId,
        deltaUsd: "0",
        balanceAfterUsd: String(balance),
        entryKind: "adjustment",
        reason: RECEIPT_TYPE,
        customerReason: "Paid plan allowance period",
        refType: RECEIPT_TYPE,
        refId: reference,
        idempotencyKey: `${RECEIPT_TYPE}:${reference}`,
        source: "stripe",
        provider: "stripe",
        providerObjectId: receipt.invoice_id,
        metadata: receipt,
      })
      .onConflictDoNothing()
      .returning({ id: schema.creditLedger.id });
    if (inserted.length === 0) {
      const [existing] = await tx
        .select({ metadata: schema.creditLedger.metadata, deltaUsd: schema.creditLedger.deltaUsd })
        .from(schema.creditLedger)
        .where(
          and(
            eq(schema.creditLedger.userId, userId),
            eq(schema.creditLedger.refType, RECEIPT_TYPE),
            eq(schema.creditLedger.refId, reference),
          ),
        )
        .limit(1);
      const saved = parseReceipt(existing?.metadata);
      if (
        !saved ||
        Number(existing?.deltaUsd) !== 0 ||
        Object.keys(receipt).some(
          (key) =>
            saved[key as keyof PaidAllowanceReceipt] !== receipt[key as keyof PaidAllowanceReceipt],
        )
      ) {
        throw allowanceSyncRequired();
      }
    }
  });
}

export function allowanceSyncRequired(): AppError {
  return new AppError(
    503,
    "PAID_ALLOWANCE_SYNC_REQUIRED",
    "Your paid usage period needs to sync. Open Billing and refresh your subscription before starting new work.",
    { recovery_path: "/settings/billing" },
  );
}

function parseReceipt(value: unknown): PaidAllowanceReceipt | null {
  if (!value || typeof value !== "object") return null;
  const row = value as PaidAllowanceReceipt;
  if (
    row.version !== 1 ||
    !["month", "year"].includes(row.interval) ||
    ![row.subscription_id, row.customer_id, row.price_id, row.invoice_id, row.plan_id].every(
      (id) => typeof id === "string" && id.length > 0,
    ) ||
    !Number.isSafeInteger(row.period_start) ||
    !Number.isSafeInteger(row.period_end) ||
    row.period_start <= 0 ||
    row.period_end <= row.period_start ||
    row.period_end - row.period_start > (row.interval === "year" ? 367 : 32) * 86400 ||
    (row.interval === "year" &&
      row.period_end * 1000 > anniversary(new Date(row.period_start * 1000), 12).getTime())
  )
    return null;
  return row;
}

/** Only channel plans use paid windows. Legacy/Free Builder retain calendar accounting. */
export async function resolveAllowanceWindow(
  reader: Reader,
  userId: string,
  now = new Date(),
): Promise<AllowanceWindow> {
  const [billing] = await reader
    .select({
      plan: schema.subscriptions.plan,
      status: schema.subscriptions.status,
      subscriptionId: schema.subscriptions.stripeSubscriptionId,
      customerId: schema.subscriptions.stripeCustomerId,
    })
    .from(schema.subscriptions)
    .where(eq(schema.subscriptions.userId, userId))
    .limit(1);
  if (planById(billing?.plan)?.catalogFamily !== "channels") return calendarAllowanceWindow(now);
  // Expired subscriptions keep their historical plan id, but reconciliation
  // restores the bounded Free Builder budget. Voice separately requires active.
  if (!["active", "trialing"].includes(billing?.status ?? "")) return calendarAllowanceWindow(now);
  if (billing?.status !== "active" || !billing.subscriptionId || !billing.customerId)
    throw allowanceSyncRequired();
  const rows = await reader
    .select({ metadata: schema.creditLedger.metadata })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, userId),
        eq(schema.creditLedger.refType, RECEIPT_TYPE),
        sql`${schema.creditLedger.metadata}->>'subscription_id' = ${billing.subscriptionId}`,
      ),
    );
  const valid = rows
    .map((row) => parseReceipt(row.metadata))
    .filter(
      (row): row is PaidAllowanceReceipt =>
        !!row &&
        row.subscription_id === billing.subscriptionId &&
        row.customer_id === billing.customerId &&
        row.plan_id === billing.plan,
    );
  for (const receipt of valid) {
    const window = paidAllowanceWindow(receipt, now);
    if (window) return window;
  }
  throw allowanceSyncRequired();
}
