import { and, eq, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { AppError } from "./api-error";
import type { PaidAllowanceReceipt } from "./paid-allowance-period";
import { drizzle } from "./server-context";

type Reader = Pick<typeof drizzle, "select">;
const MOVEMENT_TYPE = "paid_plan_funding_movement";
const RECEIPT_TYPE = "paid_plan_allowance";
const RECEIPT_KEYS = [
  "version",
  "subscription_id",
  "customer_id",
  "price_id",
  "invoice_id",
  "plan_id",
  "interval",
  "period_start",
  "period_end",
] as const;
export type PaidFundingMovement = {
  kind: "refund" | "refund_return" | "dispute_withdrawal" | "dispute_reinstatement";
  reference: string;
  amount_cents: number;
  charge_id: string;
  charge_cents: number;
  payment_intent_id: string;
};
type FundingMetadata = PaidAllowanceReceipt &
  PaidFundingMovement & {
    funding_version: 1;
    invoice_paid_cents: number;
    currency: string;
  };
type FundingRow = { metadata: unknown; deltaUsd: string | null };
const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const sameReceipt = (value: unknown, receipt: PaidAllowanceReceipt): boolean =>
  !!value &&
  typeof value === "object" &&
  RECEIPT_KEYS.every((key) => (value as Record<string, unknown>)[key] === receipt[key]);

function invalidFunding(): AppError {
  return new AppError(
    503,
    "PAID_ALLOWANCE_SYNC_REQUIRED",
    "Your paid usage funding could not be verified. Contact support before starting new work.",
    { recovery_path: "/settings/billing" },
  );
}

export function paidAllowanceFundingReversed(): AppError {
  return new AppError(
    402,
    "PAID_ALLOWANCE_FUNDING_REVERSED",
    "The payment funding this usage period was refunded or reversed. Open Billing to resolve the payment before starting new work.",
    { recovery_path: "/settings/billing" },
  );
}

function parseMovement(row: FundingRow, receipt: PaidAllowanceReceipt): FundingMetadata {
  const value = row.metadata as FundingMetadata | null;
  if (
    !sameReceipt(value, receipt) ||
    Number(row.deltaUsd) !== 0 ||
    value?.funding_version !== 1 ||
    !positiveInteger(value.invoice_paid_cents) ||
    !positiveInteger(value.amount_cents) ||
    !positiveInteger(value.charge_cents) ||
    value.amount_cents > value.charge_cents ||
    value.charge_cents > value.invoice_paid_cents ||
    !/^[a-z]{3}$/.test(value.currency) ||
    !["refund", "refund_return", "dispute_withdrawal", "dispute_reinstatement"].includes(
      value.kind,
    ) ||
    ![value.reference, value.charge_id, value.payment_intent_id].every(
      (id) => typeof id === "string" && id.length > 0,
    )
  )
    throw invalidFunding();
  return value;
}

async function fundingRows(
  reader: Reader,
  userId: string,
  invoiceId: string,
): Promise<FundingRow[]> {
  const rows = await reader
    .select({ metadata: schema.creditLedger.metadata, deltaUsd: schema.creditLedger.deltaUsd })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.userId, userId),
        eq(schema.creditLedger.refType, MOVEMENT_TYPE),
        sql`${schema.creditLedger.metadata}->>'invoice_id' = ${invoiceId}`,
      ),
    )
    .limit(1001);
  if (rows.length > 1000) throw invalidFunding();
  return rows;
}

/** Exact invoice movements, never wallet dollars or a fresh allowance grant. */
export function paidFundingIsFullyReversed(
  receipt: PaidAllowanceReceipt,
  rows: FundingRow[],
): boolean {
  const movements = rows.map((row) => parseMovement(row, receipt));
  if (!movements.length) return false;
  const { invoice_paid_cents: invoicePaidCents, currency } = movements[0];
  const original = new Map<string, FundingMetadata>();
  const seen = new Set<string>();
  const charges = new Map<string, { amount: number; removed: number; intent: string }>();
  for (const movement of movements) {
    const movementKey = `${movement.kind}:${movement.reference}`;
    if (seen.has(movementKey)) throw invalidFunding();
    seen.add(movementKey);
    if (movement.invoice_paid_cents !== invoicePaidCents || movement.currency !== currency)
      throw invalidFunding();
    const charge = charges.get(movement.charge_id) ?? {
      amount: movement.charge_cents,
      removed: 0,
      intent: movement.payment_intent_id,
    };
    if (charge.amount !== movement.charge_cents || charge.intent !== movement.payment_intent_id)
      throw invalidFunding();
    charges.set(movement.charge_id, charge);
    if (movement.kind === "refund" || movement.kind === "dispute_withdrawal") {
      const key = `${movement.kind}:${movement.reference}`;
      if (original.has(key)) throw invalidFunding();
      original.set(key, movement);
      charge.removed += movement.amount_cents;
      if (!Number.isSafeInteger(charge.removed)) throw invalidFunding();
    }
  }
  for (const movement of movements) {
    if (movement.kind !== "refund_return" && movement.kind !== "dispute_reinstatement") continue;
    const kind = movement.kind === "refund_return" ? "refund" : "dispute_withdrawal";
    const prior = original.get(`${kind}:${movement.reference}`);
    // A returned-refund proof can overtake a previously fetched succeeded
    // snapshot before either writer obtains the tenant locks. Keep it durably
    // even without a prior negative marker; that older snapshot must never
    // turn an already-returned refund into a new funding hold.
    if (!prior && movement.kind === "refund_return") continue;
    if (
      !prior ||
      prior.charge_id !== movement.charge_id ||
      movement.amount_cents > prior.amount_cents ||
      (movement.kind === "refund_return" && movement.amount_cents !== prior.amount_cents)
    )
      throw invalidFunding();
    charges.get(movement.charge_id)!.removed -= movement.amount_cents;
  }
  // Stripe can refund a payment also subject to a dispute. Count returned
  // principal at most once per charge; fees never fund an allowance.
  const removed = [...charges.values()].reduce(
    (sum, charge) => sum + Math.min(charge.amount, Math.max(0, charge.removed)),
    0,
  );
  if (!Number.isSafeInteger(removed)) throw invalidFunding();
  return removed >= invoicePaidCents;
}

export async function paidAllowanceFundingIsReversed(
  reader: Reader,
  userId: string,
  receipt: PaidAllowanceReceipt,
): Promise<boolean> {
  return paidFundingIsFullyReversed(receipt, await fundingRows(reader, userId, receipt.invoice_id));
}

/**
 * Lock order: AI budget row, then wallet advisory lock. Managed-AI admission
 * already owns the former; voice admission owns the latter. Neither can pass
 * a funding read and admit new work concurrently with this commit. Existing
 * admitted calls retain their immutable funding/settlement receipts.
 */
export async function recordPaidAllowanceFundingMovements(input: {
  userId: string;
  receipt: PaidAllowanceReceipt;
  invoicePaidCents: number;
  currency: string;
  providerEventId: string;
  movements: PaidFundingMovement[];
}): Promise<void> {
  const { userId, receipt, invoicePaidCents, currency, providerEventId } = input;
  if (!positiveInteger(invoicePaidCents) || !/^[a-z]{3}$/.test(currency) || !providerEventId)
    throw invalidFunding();
  await drizzle.transaction(async (tx) => {
    const [budget] = await tx
      .select({ userId: schema.spendBudgets.userId })
      .from(schema.spendBudgets)
      .where(eq(schema.spendBudgets.userId, userId))
      .limit(1)
      .for("update");
    if (!budget) throw invalidFunding();
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${userId}))`);
    const [canonical] = await tx
      .select({ metadata: schema.creditLedger.metadata, deltaUsd: schema.creditLedger.deltaUsd })
      .from(schema.creditLedger)
      .where(
        and(
          eq(schema.creditLedger.userId, userId),
          eq(schema.creditLedger.refType, RECEIPT_TYPE),
          eq(schema.creditLedger.refId, `${receipt.subscription_id}:${receipt.period_start}`),
        ),
      )
      .limit(1);
    if (!canonical || !sameReceipt(canonical.metadata, receipt) || Number(canonical.deltaUsd) !== 0)
      throw invalidFunding();
    const rows = await fundingRows(tx, userId, receipt.invoice_id);
    paidFundingIsFullyReversed(receipt, rows);
    const [sum] = await tx
      .select({ balance: sql<string>`COALESCE(SUM(${schema.creditLedger.deltaUsd}), 0)` })
      .from(schema.creditLedger)
      .where(eq(schema.creditLedger.userId, userId));
    const balance = Number(sum?.balance);
    if (!Number.isFinite(balance)) throw invalidFunding();
    for (const movement of input.movements) {
      const metadata: FundingMetadata = {
        ...receipt,
        ...movement,
        funding_version: 1,
        invoice_paid_cents: invoicePaidCents,
        currency,
      };
      parseMovement({ metadata, deltaUsd: "0" }, receipt);
      const prior = rows.find((row) => {
        const value = row.metadata as FundingMetadata;
        return value.kind === movement.kind && value.reference === movement.reference;
      });
      if (prior) {
        const saved = parseMovement(prior, receipt);
        if (
          Object.entries(metadata).some(
            ([key, value]) => saved[key as keyof FundingMetadata] !== value,
          )
        )
          throw invalidFunding();
        continue;
      }
      const nextRows = [...rows, { metadata, deltaUsd: "0" }];
      paidFundingIsFullyReversed(receipt, nextRows);
      const reference = `${receipt.invoice_id}:${movement.kind}:${movement.reference}`;
      const inserted = await tx
        .insert(schema.creditLedger)
        .values({
          userId,
          deltaUsd: "0",
          balanceAfterUsd: String(balance),
          entryKind: "adjustment",
          reason: MOVEMENT_TYPE,
          customerReason: "Paid plan funding reconciliation",
          refType: MOVEMENT_TYPE,
          refId: reference,
          idempotencyKey: `${MOVEMENT_TYPE}:${reference}`,
          source: "stripe",
          provider: "stripe",
          providerEventId,
          providerObjectId: movement.reference,
          metadata,
        })
        .onConflictDoNothing()
        .returning({ id: schema.creditLedger.id });
      if (!inserted.length) throw invalidFunding();
      rows.push({ metadata, deltaUsd: "0" });
    }
  });
}
