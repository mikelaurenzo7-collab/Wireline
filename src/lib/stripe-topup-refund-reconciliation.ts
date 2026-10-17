import type Stripe from "stripe";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import * as schema from "../db/schema";
import { drizzle, tenantStore } from "./server-context";
import {
  assertStripeRefundInventoryCaughtUp,
  type StripeRefundLifecycleExpectation,
} from "./stripe-refund-lifecycle";

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
function wholeCents(value: unknown): number {
  const cents = Number(value) * 100;
  const rounded = Math.round(cents);
  if (!Number.isSafeInteger(rounded) || Math.abs(rounded - cents) > 0.000001)
    throw new Error("Stripe top-up ledger amount is not a whole number of cents.");
  return rounded;
}

async function refundInventory(stripe: Stripe, chargeId: string): Promise<Stripe.Refund[]> {
  const refunds: Stripe.Refund[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page = await stripe.refunds.list({
      charge: chargeId,
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    });
    for (const refund of page.data) {
      if (!refund.id || seen.has(refund.id))
        throw new Error("Stripe top-up refund inventory has a duplicate or missing identity.");
      seen.add(refund.id);
      refunds.push(refund);
    }
    if (refunds.length > 1000)
      throw new Error("Stripe top-up refund inventory exceeds the reconciliation limit.");
    if (!page.has_more) return refunds;
    const next = page.data.at(-1)?.id;
    if (!next || next === cursor)
      throw new Error("Stripe refund pagination has no advancing cursor.");
    cursor = next;
  }
}

export async function hasPostedStripeTopUpCredit(paymentIntentId: string): Promise<boolean> {
  const rows = await drizzle
    .select({ id: schema.creditLedger.id })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.refType, "stripe_session"),
        sql`${schema.creditLedger.metadata}->>'payment_intent' = ${paymentIntentId}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Reconcile standalone purchased credit, never channel-period allowance.
 * Owner and maximum credit come from the already posted, immutable Checkout
 * receipt. PaymentIntent metadata is only a hint that a missing receipt must
 * retry; it cannot select a wallet or invent a credit amount.
 */
export async function resolveStripeTopUpCredit(input: { stripe: Stripe; chargeId: string }) {
  const { stripe, chargeId } = input;
  const charge = await stripe.charges.retrieve(chargeId);
  if (charge.id !== chargeId) throw new Error("Stripe top-up charge identity mismatch.");
  const paymentIntentId = idOf(charge.payment_intent);
  if (!paymentIntentId) return null;
  const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (pi.id !== paymentIntentId) throw new Error("Stripe top-up PaymentIntent identity mismatch.");
  const candidates = await drizzle
    .select()
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.refType, "stripe_session"),
        sql`${schema.creditLedger.metadata}->>'payment_intent' = ${paymentIntentId}`,
      ),
    )
    .limit(3);
  if (!candidates.length) {
    if (pi.metadata?.purpose === "credit_topup")
      throw new Error(
        "Stripe top-up is awaiting its original settled Checkout credit. Reconcile Checkout fulfillment before retrying the refund.",
      );
    return null;
  }
  if (candidates.length !== 1)
    throw new Error("Stripe top-up has ambiguous original Checkout credit ownership.");
  const original = candidates[0];
  const grantCents = wholeCents(original.deltaUsd);
  const originalMetadata = object(original.metadata);
  if (
    !original.userId ||
    !original.refId ||
    original.reason !== "web_topup" ||
    original.entryKind !== "top_up" ||
    (original.provider !== null && original.provider !== "stripe") ||
    (original.providerObjectId && original.providerObjectId !== original.refId) ||
    grantCents <= 0 ||
    originalMetadata.payment_intent !== paymentIntentId ||
    (originalMetadata.currency && originalMetadata.currency !== "usd") ||
    (originalMetadata.checkout_session_id &&
      originalMetadata.checkout_session_id !== original.refId)
  )
    throw new Error("Stripe top-up original credit provenance is invalid.");

  // This also permits older receipts without provider_object_id: their exact
  // immutable session ref and intent linkage must resolve through this merchant.
  const session = await stripe.checkout.sessions.retrieve(original.refId);
  const customerId = idOf(charge.customer);
  if (
    session.id !== original.refId ||
    session.mode !== "payment" ||
    session.payment_status !== "paid" ||
    idOf(session.payment_intent) !== paymentIntentId ||
    !customerId ||
    customerId !== idOf(session.customer) ||
    customerId !== idOf(pi.customer) ||
    !positiveInteger(charge.amount) ||
    charge.paid !== true ||
    pi.status !== "succeeded" ||
    pi.amount !== charge.amount ||
    session.amount_total !== charge.amount ||
    grantCents > charge.amount ||
    charge.currency !== "usd" ||
    session.currency !== charge.currency ||
    pi.currency !== charge.currency ||
    typeof charge.livemode !== "boolean" ||
    session.livemode !== charge.livemode ||
    pi.livemode !== charge.livemode
  )
    throw new Error(
      "Stripe top-up Checkout, charge and customer provenance could not be verified.",
    );
  return { original, grantCents, charge, paymentIntent: pi, session, customerId, paymentIntentId };
}

/**
 * Run in webhook/system scope before entering the original owner's tenant.
 * A historical metadata-based writer may have debited another wallet. Its
 * per-user idempotency key must not turn a canonical retry into a second debit.
 * Conflicts require reconciliation; this guard never changes old movements.
 */
export async function assertStripeTopUpMovementOwnership(
  context: NonNullable<Awaited<ReturnType<typeof resolveStripeTopUpCredit>>>,
  referenceTypes: string[],
  referenceIds: string[],
): Promise<void> {
  const { original, paymentIntentId, charge } = context;
  const rows = await drizzle
    .select({
      userId: schema.creditLedger.userId,
      metadata: schema.creditLedger.metadata,
    })
    .from(schema.creditLedger)
    .where(
      and(
        inArray(schema.creditLedger.refType, referenceTypes),
        or(
          sql`${schema.creditLedger.metadata}->>'payment_intent_id' = ${paymentIntentId}`,
          inArray(schema.creditLedger.refId, referenceIds),
        ),
      ),
    )
    .limit(2001);
  if (rows.length > 2000)
    throw new Error("Stripe top-up movement inventory exceeds the reconciliation limit.");
  for (const row of rows) {
    const metadata = object(row.metadata);
    if (
      row.userId !== original.userId ||
      metadata.payment_intent_id !== paymentIntentId ||
      (metadata.charge_id && metadata.charge_id !== charge.id) ||
      (metadata.checkout_session_id && metadata.checkout_session_id !== original.refId) ||
      (metadata.original_credit_id && metadata.original_credit_id !== original.id)
    )
      throw new Error(
        "Stripe top-up has conflicting historical movement ownership or provenance. Operator reconciliation is required before retrying.",
      );
  }
}

export async function reconcileStripeTopUpRefunds(
  input: {
    stripe: Stripe;
    chargeId: string;
    providerEventId: string;
  } & StripeRefundLifecycleExpectation,
): Promise<boolean> {
  const { stripe, chargeId, providerEventId } = input;
  const context = await resolveStripeTopUpCredit({ stripe, chargeId });
  if (!context) return false;
  const { original, grantCents, charge, customerId, paymentIntentId } = context;

  // Exhaust and validate before locking/mutating. A failed later page must not
  // leave a partially debited wallet, and tax is never treated as wallet credit.
  const refunds = await refundInventory(stripe, chargeId);
  assertStripeRefundInventoryCaughtUp(charge, refunds, input);
  let succeededCents = 0;
  const movements = refunds
    .flatMap((refund) => {
      if (
        idOf(refund.charge) !== chargeId ||
        (idOf(refund.payment_intent) && idOf(refund.payment_intent) !== paymentIntentId) ||
        refund.currency !== charge.currency ||
        !positiveInteger(refund.amount) ||
        refund.amount > charge.amount
      )
        throw new Error("Stripe top-up refund provenance could not be verified.");
      const returned =
        (refund.status === "failed" || refund.status === "canceled") &&
        !!idOf(refund.failure_balance_transaction);
      const succeeded = refund.status === "succeeded";
      if (!succeeded && refund.status !== "failed" && refund.status !== "canceled") return [];
      if (succeeded) succeededCents += refund.amount;
      return [
        {
          refund,
          returned,
          succeeded,
          creditCents: Number((BigInt(refund.amount) * BigInt(grantCents)) / BigInt(charge.amount)),
        },
      ];
    })
    .sort((left, right) => Number(right.returned) - Number(left.returned));
  if (!Number.isSafeInteger(succeededCents) || succeededCents > charge.amount)
    throw new Error("Stripe top-up succeeded refunds exceed the original paid principal.");
  if (
    charge.amount_refunded > 0 &&
    !movements.some(({ succeeded, returned }) => succeeded || returned)
  )
    throw new Error("Stripe top-up reports refunded principal without settled refund evidence.");
  if (!movements.length) return true;

  await assertStripeTopUpMovementOwnership(
    context,
    ["stripe_refund", "stripe_refund_return"],
    movements.map(({ refund }) => refund.id),
  );

  await tenantStore.run(original.userId, () =>
    drizzle.transaction(async (tx) => {
      // Same lock as all wallet admissions/credits/debits; no budget-row lock.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${original.userId}))`);
      const [currentOriginal] = await tx
        .select()
        .from(schema.creditLedger)
        .where(
          and(
            eq(schema.creditLedger.id, original.id),
            eq(schema.creditLedger.userId, original.userId),
          ),
        );
      if (
        !currentOriginal ||
        wholeCents(currentOriginal.deltaUsd) !== grantCents ||
        currentOriginal.refId !== original.refId ||
        object(currentOriginal.metadata).payment_intent !== paymentIntentId
      )
        throw new Error("Stripe top-up original credit changed during reconciliation.");
      const ids = movements.map(({ refund }) => refund.id);
      const rows = await tx
        .select()
        .from(schema.creditLedger)
        .where(
          and(
            eq(schema.creditLedger.userId, original.userId),
            inArray(schema.creditLedger.refType, ["stripe_refund", "stripe_refund_return"]),
            or(
              sql`${schema.creditLedger.metadata}->>'payment_intent_id' = ${paymentIntentId}`,
              inArray(schema.creditLedger.refId, ids),
            ),
          ),
        );
      const prior = new Map<string, (typeof rows)[number]>();
      let netDebitedCents = 0;
      for (const row of rows) {
        const metadata = object(row.metadata);
        if (
          metadata.payment_intent_id !== paymentIntentId ||
          metadata.charge_id !== chargeId ||
          (metadata.original_credit_id && metadata.original_credit_id !== original.id) ||
          (metadata.currency && metadata.currency !== "usd") ||
          (metadata.customer_id && metadata.customer_id !== customerId) ||
          (metadata.checkout_session_id && metadata.checkout_session_id !== original.refId) ||
          !row.refId ||
          prior.has(`${row.refType}:${row.refId}`)
        )
          throw new Error("Stripe top-up prior refund movement has conflicting provenance.");
        const deltaCents = wholeCents(row.deltaUsd);
        if (
          (row.refType === "stripe_refund" && deltaCents >= 0) ||
          (row.refType === "stripe_refund_return" && deltaCents < 0)
        )
          throw new Error("Stripe top-up prior refund movement has an invalid direction.");
        netDebitedCents -= deltaCents;
        prior.set(`${row.refType}:${row.refId}`, row);
      }
      for (const row of rows.filter((candidate) => candidate.refType === "stripe_refund_return")) {
        const debit = prior.get(`stripe_refund:${row.refId}`);
        const restoredCents = wholeCents(row.deltaUsd);
        if (
          (restoredCents > 0 && (!debit || restoredCents !== -wholeCents(debit.deltaUsd))) ||
          (restoredCents === 0 && debit)
        )
          throw new Error("Stripe top-up return does not match its exact posted refund debit.");
      }
      if (netDebitedCents < 0 || netDebitedCents > grantCents)
        throw new Error("Stripe top-up prior refund movements exceed the posted credit.");
      const [sum] = await tx
        .select({ balance: sql<string>`COALESCE(SUM(${schema.creditLedger.deltaUsd}), 0)` })
        .from(schema.creditLedger)
        .where(eq(schema.creditLedger.userId, original.userId));
      let balanceCents = wholeCents(sum?.balance ?? 0);
      for (const { refund, returned, succeeded, creditCents } of movements) {
        const debit = prior.get(`stripe_refund:${refund.id}`);
        const restored = prior.get(`stripe_refund_return:${refund.id}`);
        if (restored) {
          const metadata = object(restored.metadata);
          if (
            metadata.refund_cents !== refund.amount ||
            metadata.grant_cents !== grantCents ||
            metadata.charge_cents !== charge.amount
          )
            throw new Error("Stripe top-up returned-refund proof does not match this refund.");
          // A durable return (including a zero-dollar returned-first tombstone)
          // outranks a succeeded snapshot fetched before this wallet lock.
          continue;
        }
        if (debit && Math.abs(wholeCents(debit.deltaUsd)) !== creditCents)
          throw new Error("Stripe top-up prior refund debit does not match its original credit.");
        if (!succeeded && !returned) {
          if (debit)
            throw new Error(
              "Stripe top-up failed refund is awaiting authoritative returned-funds proof.",
            );
          continue;
        }
        if (!returned && (debit || creditCents === 0)) continue;
        const deltaCents = returned ? (debit ? -wholeCents(debit.deltaUsd) : 0) : -creditCents;
        netDebitedCents -= deltaCents;
        if (netDebitedCents < 0 || netDebitedCents > grantCents)
          throw new Error("Stripe top-up cumulative refund movements exceed the posted credit.");
        balanceCents += deltaCents;
        const refType = returned ? "stripe_refund_return" : "stripe_refund";
        const inserted = await tx
          .insert(schema.creditLedger)
          .values({
            userId: original.userId,
            deltaUsd: String(deltaCents / 100),
            balanceAfterUsd: String(balanceCents / 100),
            entryKind: returned ? "adjustment" : "refund",
            reason: returned ? "web_topup_refund_returned" : "web_topup_refund",
            customerReason: returned
              ? "Runtime Balance restored after refund failed"
              : "Runtime Balance refund",
            refType,
            refId: refund.id,
            idempotencyKey: `${refType}:${refund.id}`,
            source: "stripe",
            provider: "stripe",
            providerEventId,
            providerObjectId: refund.id,
            metadata: {
              payment_intent_id: paymentIntentId,
              charge_id: chargeId,
              checkout_session_id: original.refId,
              original_credit_id: original.id,
              refund_cents: refund.amount,
              grant_cents: grantCents,
              charge_cents: charge.amount,
              currency: charge.currency,
              customer_id: customerId,
              livemode: charge.livemode,
              ...(returned
                ? { failure_balance_transaction: idOf(refund.failure_balance_transaction) }
                : {}),
            },
          })
          .onConflictDoNothing()
          .returning({ id: schema.creditLedger.id });
        if (inserted.length !== 1)
          throw new Error("Stripe top-up refund movement conflicted during reconciliation.");
      }
    }),
  );
  return true;
}
