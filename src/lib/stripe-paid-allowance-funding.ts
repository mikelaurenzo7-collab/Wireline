import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { parsePaidAllowanceReceipt } from "./paid-allowance-period";
import {
  recordPaidAllowanceFundingMovements,
  type PaidFundingMovement,
} from "./paid-allowance-funding-ledger";
import { disputeBalanceMovementCents } from "./stripe-dispute-accounting";
import { drizzle, tenantStore } from "./server-context";
import {
  assertStripeRefundInventoryCaughtUp,
  type StripeRefundLifecycleExpectation,
} from "./stripe-refund-lifecycle";
import {
  hasPaidChannelBaseInvoiceLine,
  stripeInvoiceIdForCharge,
  stripeSubscriptionIdForInvoice,
} from "./stripe-helpers";

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;
const positiveInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

async function allRefunds(stripe: Stripe, chargeId: string): Promise<Stripe.Refund[]> {
  const refunds: Stripe.Refund[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await stripe.refunds.list({
      charge: chargeId,
      limit: 100,
      ...(cursor ? { starting_after: cursor } : {}),
    });
    refunds.push(...page.data);
    if (!page.has_more) return refunds;
    const next = page.data.at(-1)?.id;
    if (!next || next === cursor)
      throw new Error("Stripe refund pagination has no advancing cursor.");
    cursor = next;
  }
}

/**
 * Resolve immutable paid-receipt ownership, never PaymentIntent metadata or a
 * tenant's replacement subscription. Every Stripe object is read through the
 * currently configured merchant client; unavailable/ambiguous linkage retries.
 */
export async function reconcilePaidAllowanceFundingForCharge(
  input: {
    stripe: Stripe;
    chargeId: string;
    providerEventId: string;
    dispute?: Stripe.Dispute;
  } & StripeRefundLifecycleExpectation,
): Promise<boolean> {
  const { stripe, chargeId, providerEventId, dispute } = input;
  const charge = await stripe.charges.retrieve(chargeId);
  if (charge.id !== chargeId)
    throw new Error("Stripe charge identity did not match funding request.");
  const invoiceId = await stripeInvoiceIdForCharge(charge);
  if (!invoiceId) return false;
  const invoice = await stripe.invoices.retrieve(invoiceId);
  if (invoice.id !== invoiceId)
    throw new Error("Stripe invoice identity did not match funded charge.");
  if (invoice.lines.has_more) {
    const lines: Stripe.InvoiceLineItem[] = [];
    for await (const line of stripe.invoices.listLineItems(invoice.id, { limit: 100 }))
      lines.push(line);
    invoice.lines = { ...invoice.lines, data: lines, has_more: false };
  }
  const candidates = await drizzle
    .select({
      userId: schema.creditLedger.userId,
      metadata: schema.creditLedger.metadata,
      deltaUsd: schema.creditLedger.deltaUsd,
    })
    .from(schema.creditLedger)
    .where(
      and(
        eq(schema.creditLedger.refType, "paid_plan_allowance"),
        eq(schema.creditLedger.provider, "stripe"),
        eq(schema.creditLedger.providerObjectId, invoiceId),
      ),
    )
    .limit(3);
  const owners = candidates.filter((row) => parsePaidAllowanceReceipt(row.metadata));
  if (!owners.length) {
    if (hasPaidChannelBaseInvoiceLine(invoice))
      throw new Error(
        `Stripe invoice ${invoiceId} is awaiting its canonical paid allowance receipt.`,
      );
    return false;
  }
  if (owners.length !== 1)
    throw new Error(`Stripe invoice ${invoiceId} has ambiguous paid allowance ownership.`);
  const owner = owners[0];
  const receipt = parsePaidAllowanceReceipt(owner.metadata)!;
  const paymentIntentId = idOf(charge.payment_intent);
  const lineMatches = invoice.lines.data.some((line) => {
    const legacy = line as Stripe.InvoiceLineItem & {
      price?: Stripe.Price | string;
      proration?: boolean;
    };
    return (
      line.amount > 0 &&
      idOf(line.pricing?.price_details?.price ?? legacy.price) === receipt.price_id &&
      !line.parent?.subscription_item_details?.proration &&
      !legacy.proration &&
      line.period.start === receipt.period_start &&
      line.period.end === receipt.period_end
    );
  });
  if (
    !owner.userId ||
    Number(owner.deltaUsd) !== 0 ||
    receipt.invoice_id !== invoice.id ||
    receipt.subscription_id !== stripeSubscriptionIdForInvoice(invoice) ||
    receipt.customer_id !== idOf(invoice.customer) ||
    receipt.customer_id !== idOf(charge.customer) ||
    invoice.status !== "paid" ||
    !lineMatches ||
    !paymentIntentId ||
    charge.paid !== true ||
    !positiveInteger(invoice.amount_paid) ||
    !positiveInteger(charge.amount) ||
    charge.amount > invoice.amount_paid ||
    invoice.currency !== charge.currency ||
    typeof invoice.livemode !== "boolean" ||
    invoice.livemode !== charge.livemode
  )
    throw new Error(`Stripe invoice ${invoiceId} funding provenance could not be verified.`);

  const movements: PaidFundingMovement[] = [];
  const movement = (kind: PaidFundingMovement["kind"], reference: string, amount: number) => {
    if (!positiveInteger(amount) || amount > charge.amount)
      throw new Error(`Stripe charge ${chargeId} has invalid funding principal.`);
    movements.push({
      kind,
      reference,
      amount_cents: amount,
      charge_id: charge.id,
      charge_cents: charge.amount,
      payment_intent_id: paymentIntentId,
    });
  };
  const refunds = await allRefunds(stripe, charge.id);
  assertStripeRefundInventoryCaughtUp(charge, refunds, input);
  for (const refund of refunds) {
    if (idOf(refund.charge) !== charge.id || refund.currency !== charge.currency)
      throw new Error(`Stripe refund ${refund.id} does not belong to the funded charge.`);
    if (refund.status === "succeeded") movement("refund", refund.id, refund.amount);
    else if (
      (refund.status === "failed" || refund.status === "canceled") &&
      idOf(refund.failure_balance_transaction)
    ) {
      // Stripe's authoritative failed-refund balance transaction proves the
      // funds returned. A failure before success has no prior hold to restore.
      movement("refund_return", refund.id, refund.amount);
    }
  }
  if (dispute) {
    if (
      idOf(dispute.charge) !== charge.id ||
      dispute.currency !== charge.currency ||
      (idOf(dispute.payment_intent) && idOf(dispute.payment_intent) !== paymentIntentId)
    )
      throw new Error(`Stripe dispute ${dispute.id} does not belong to the funded charge.`);
    const transactions = (dispute.balance_transactions ?? []).filter(
      (value): value is Stripe.BalanceTransaction => !!value && typeof value !== "string",
    );
    for (const direction of ["withdrawn", "reinstated"] as const) {
      const amount = disputeBalanceMovementCents({
        disputeAmountCents: dispute.amount,
        disputeCurrency: dispute.currency,
        balanceTransactions: transactions,
        direction,
      });
      if (amount > 0)
        movement(
          direction === "withdrawn" ? "dispute_withdrawal" : "dispute_reinstatement",
          dispute.id,
          amount,
        );
    }
  }
  if (!movements.length) return false;
  // Withdrawals precede matching restorations even if the provider delivered
  // reinstatement first. They commit atomically and preserve original usage.
  movements.sort(
    (a, b) =>
      Number(a.kind.endsWith("return") || a.kind.endsWith("reinstatement")) -
      Number(b.kind.endsWith("return") || b.kind.endsWith("reinstatement")),
  );
  await tenantStore.run(owner.userId, () =>
    recordPaidAllowanceFundingMovements({
      userId: owner.userId,
      receipt,
      invoicePaidCents: invoice.amount_paid,
      currency: invoice.currency,
      providerEventId,
      movements,
    }),
  );
  return true;
}
