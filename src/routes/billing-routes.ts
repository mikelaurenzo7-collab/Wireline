import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe events and subscription payloads are vendor-defined JSON. */
import express, { Request, Response } from "express";
import { drizzle, log, tenantStore, auditLogger } from "../lib/server-context";
import * as schema from "../db/schema";
import { and, eq, inArray, lt, count, sql } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import { getErrorMessage } from "../lib/server-utils";
import {
  stripe,
  stripeAvailable,
  subscriptionBillingInterval,
  syncSubscriptionFromStripe,
  basePlanInvoiceShare,
  stripeCheckoutIntegrationIdentifier,
  stripeCheckoutTaxConfig,
  stripeInvoiceIdForCharge,
  isMissingStripeResource,
} from "../lib/stripe-helpers";
import { sendPaymentFailedEmail } from "../lib/email-service";
import { planById, plansForClient, FOUNDER_CATALOG_VERSION } from "../lib/plan-catalog";
import { getIncludedPhoneLineSlots } from "../lib/phone-line-entitlements";
import { getWorkspaceUsageSnapshot } from "../lib/workspace-usage-snapshot";
import { reverseCredit } from "../lib/credit-wallet";
import { reverseSubscriptionRuntimeAllowance } from "../lib/subscription-welcome-credit";
import Stripe from "stripe";
import type { AuthenticatedRequest } from "../types/auth";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import { isLiveVideoCatalogReady } from "../lib/video-presenter/live-video-entitlements";
import {
  failStripeCheckoutSession,
  fulfillStripeCheckoutSession,
} from "../lib/stripe-checkout-fulfillment";
import { checkoutOperations } from "../db/security-schema";
import { listCurrentLiveVideoAddons } from "../lib/stripe-live-video-addon";

const router = express.Router();
const LIVE_VIDEO_CHECKOUT_TTL_MS = 24 * 60 * 60_000;
const ACTIVE_CHECKOUT_OPERATION_STATES = ["creating", "open"];
const LIVE_VIDEO_CHECKOUT_OPERATION_PLAN = "live_video";
const CHECKOUT_OPERATION_ID = /^[0-9a-f]{8}-[0-9a-f-]{27}$/i;

function isAmbiguousStripeCheckoutError(error: unknown): boolean {
  const candidate = error as { type?: unknown; statusCode?: unknown };
  const type = typeof candidate?.type === "string" ? candidate.type : "";
  const statusCode =
    typeof candidate?.statusCode === "number" && Number.isFinite(candidate.statusCode)
      ? candidate.statusCode
      : null;
  return (
    type === "StripeConnectionError" ||
    type === "StripeIdempotencyError" ||
    statusCode === null ||
    statusCode === 409 ||
    statusCode === 429 ||
    statusCode >= 500
  );
}

async function markLiveVideoCheckoutOperation(
  id: string,
  values: {
    status: "creating" | "open" | "completed" | "failed" | "expired";
    stripeCustomerId?: string | null;
    stripeCheckoutSessionId?: string | null;
    checkoutUrl?: string | null;
    failureCode?: string | null;
  },
): Promise<void> {
  await drizzle
    .update(checkoutOperations)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(checkoutOperations.id, id));
}

async function failCreatingLiveVideoCheckoutOperation(
  id: string,
  stripeCustomerId: string | null,
): Promise<void> {
  await drizzle
    .update(checkoutOperations)
    .set({
      status: "failed",
      stripeCustomerId,
      failureCode: "stripe_live_video_checkout_failed",
      updatedAt: new Date(),
    })
    .where(and(eq(checkoutOperations.id, id), eq(checkoutOperations.status, "creating")));
}

async function insertLiveVideoCheckoutOperation(userId: string): Promise<string | null> {
  const [operation] = await drizzle
    .insert(checkoutOperations)
    .values({
      userId,
      planId: LIVE_VIDEO_CHECKOUT_OPERATION_PLAN,
      billingInterval: "month",
      status: "creating",
      expiresAt: new Date(Date.now() + LIVE_VIDEO_CHECKOUT_TTL_MS),
    })
    .onConflictDoNothing()
    .returning({ id: checkoutOperations.id });
  return operation?.id ?? null;
}

// Refuse to send a customer to Stripe checkout with a price that isn't part of
// the current founder catalog. Guards against a Vercel env var pointing at a
// retired/orphaned price after a catalog rotation — mirrors the launch-billing
// checkout's resolveLaunchPriceId validator (see launch-billing-checkout-routes.ts).
// Returns `null` when the price is missing, inactive, or lacks the catalog
// marker; callers should refuse the checkout with a 503 in that case.
async function validateFounderCatalogPriceId(priceId: string): Promise<string | null> {
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (!price.active) return null;
    if (price.metadata?.wireline_catalog_version !== FOUNDER_CATALOG_VERSION) return null;
    return price.id;
  } catch (error) {
    log.warn("Stripe price validation failed for founder-catalog checkout", {
      priceId,
      error: getErrorMessage(error),
    });
    return null;
  }
}

/**
 * Scale a gross (tax-inclusive) refunded/disputed Stripe amount down to the
 * portion of the wallet credit it actually represents. When Automatic Tax is
 * enabled, top-up checkouts credit only the pre-tax `credit_usd`, so
 * reversing the gross amount would claw back more than was ever granted —
 * a fully-refunded customer would land at a negative balance and be blocked
 * on completion-grace debt they never spent. `credit_usd` rides on the
 * PaymentIntent metadata (set at checkout creation), and `pi.amount` is the
 * tax-inclusive total, so each reversal scales by credited/charged. Rounds
 * DOWN so cumulative partial reversals can never exceed the granted credit.
 * Falls back to the gross amount when the metadata is absent (legacy top-ups)
 * or no exclusive tax was added (ratio = 1 — identical to prior behavior).
 */
function creditPortionUsd(grossCents: number, pi: Stripe.PaymentIntent): number {
  const grossUsd = (grossCents || 0) / 100;
  const creditUsd = Number(pi.metadata?.credit_usd);
  const chargedUsd = (pi.amount || 0) / 100;
  if (!Number.isFinite(creditUsd) || creditUsd <= 0 || chargedUsd <= 0) return grossUsd;
  if (creditUsd >= chargedUsd) return grossUsd;
  return Math.min(creditUsd, Math.floor(grossUsd * (creditUsd / chargedUsd) * 100) / 100);
}

/**
 * Reverse the Runtime Allowance funded by a refunded/disputed SUBSCRIPTION
 * charge. Top-ups are handled separately (they carry purpose=credit_topup);
 * a subscription invoice PaymentIntent carries no such marker, which is why
 * these charges previously fell straight through and left the allowance
 * spendable after the money went back.
 *
 * Resolves charge -> invoice -> subscription so the plan and billing interval
 * match what was actually granted, then reverses under the refund/dispute id.
 */
async function reverseRuntimeAllowanceForCharge(
  charge: Stripe.Charge,
  reason: "refund" | "dispute",
  explicitReference?: string,
): Promise<void> {
  try {
    const invoiceId = await stripeInvoiceIdForCharge(charge);
    if (!invoiceId) return;

    const invoice = await stripe.invoices.retrieve(invoiceId);
    const subField = (invoice as Stripe.Invoice & { subscription?: string | { id: string } })
      .subscription;
    const subscriptionId = typeof subField === "string" ? subField : subField?.id;
    if (!subscriptionId) return;

    const [row] = await drizzle
      .select({ userId: schema.subscriptions.userId, plan: schema.subscriptions.plan })
      .from(schema.subscriptions)
      .where(eq(schema.subscriptions.stripeSubscriptionId, subscriptionId))
      .limit(1);
    if (!row?.userId) return;

    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    // Resolve the interval the SAME way the grant did (any yearly item ⇒
    // yearly), not off items.data[0] — a yearly plan carrying a monthly
    // extra-agent item at index 0 was reversing a month's allowance against a
    // year's grant.
    const interval = subscriptionBillingInterval(sub);

    // Scale by the share of the invoice that funded the base plan: refunding
    // or disputing a separate add-on invoice (e.g. a monthly extra-agent
    // charge on an annual plan) must not claw back allowance that charge
    // never funded. A null share means this charge funded no allowance.
    const allowanceShare = basePlanInvoiceShare(invoice);
    if (allowanceShare === null) return;

    // Stripe orders refunds newest-first, so find() returns the refund that
    // triggered THIS event; its id is unique per event, so redelivery is
    // idempotent through the (user, ref) ledger index.
    const succeededRefund = charge.refunds?.data?.find(
      (r) => !r.status || r.status === "succeeded",
    );
    const reference = explicitReference ?? succeededRefund?.id ?? charge.id;

    // Reverse only the portion of the charge actually refunded. A dispute
    // holds the entire charge; a refund reverses its own share. Without this,
    // each of two partial refunds clawed back the FULL allowance (each under
    // its own reference, so idempotency did not stop it), driving a paying
    // customer's wallet negative and hard-blocking their live voice.
    const chargeCents = charge.amount || 0;
    const refundedCents =
      reason === "dispute"
        ? chargeCents
        : (succeededRefund?.amount ?? charge.amount_refunded ?? chargeCents);
    const portion =
      (chargeCents > 0 ? Math.min(1, refundedCents / chargeCents) : 1) * allowanceShare;

    await tenantStore.run(row.userId, async () => {
      await reverseSubscriptionRuntimeAllowance(
        row.userId as string,
        reference,
        row.plan,
        interval,
        reason,
        portion,
      );
    });
  } catch (error) {
    // The reversal is a required financial side effect. A transient Stripe,
    // database, tenant-context, or ledger failure must escape to the outer
    // webhook handler so it releases the idempotency claim and returns a
    // retryable 5xx. Ledger reference keys make the retry idempotent.
    log.error("subscription runtime allowance reversal failed", {
      chargeId: charge.id,
      reason,
      error: getErrorMessage(error),
    });
    throw error;
  }
}

// ─── Stripe Webhook ──────────────────────────────────────────────────────────

router.post("/stripe-webhook", async (req: Request, res: Response) => {
  if (!stripeAvailable() || !process.env.STRIPE_WEBHOOK_SECRET) {
    throw AppError.fromHttpStatus(503, "Stripe webhook not configured.");
  }
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) throw AppError.fromHttpStatus(400, "Missing stripe-signature header.");

  let event: Stripe.Event;
  try {
    // express.raw populated req.body as a Buffer
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    // Include ip + signature prefix so abuse patterns (probing, replay)
    // are detectable from log aggregation. Full signature isn't logged
    // since it's a HMAC of the body — bounded leak risk if logs are
    // shared with third-party SIEMs, and the prefix is enough to
    // correlate repeated rejections from the same attacker.
    log.warn("Stripe webhook signature verification failed", {
      error: getErrorMessage(err),
      ip: req.ip,
      sig_prefix: typeof sig === "string" ? sig.slice(0, 12) : null,
      ts: Date.now(),
    });
    throw AppError.fromHttpStatus(400, "Webhook signature verification failed.");
  }

  const idempotencyKey = event.id;
  let claimed = false;
  try {
    await drizzle
      .insert(schema.stripeEvents)
      .values({ eventId: idempotencyKey, eventType: event.type, status: "processing" });

    claimed = true;
  } catch (err: any) {
    if (err.code === "23505" || /duplicate key/i.test(err.message)) {
      // A duplicate is only genuinely a duplicate if the prior attempt actually
      // finished. A claim still sitting at "processing" means an earlier
      // invocation was killed mid-handler (maxDuration, OOM, recycle) and its
      // rollback never ran — answering 2xx there would permanently drop the
      // event, which for a credit top-up means the customer paid and their
      // balance never moved. Release the stale claim and make Stripe redeliver.
      const [prior] = await drizzle
        .select({ status: schema.stripeEvents.status, at: schema.stripeEvents.processedAt })
        .from(schema.stripeEvents)
        .where(eq(schema.stripeEvents.eventId, idempotencyKey))
        .limit(1);

      const abandonedAfterMs = 5 * 60 * 1000;
      const isProcessing = prior?.status === "processing";
      const stale =
        isProcessing && Date.now() - new Date(prior.at ?? 0).getTime() > abandonedAfterMs;

      // Never 2xx an unfinished claim. Stripe stops redelivering after 2xx, so
      // a mid-flight "processing" row would permanently drop paid events
      // (top-ups, entitlement sync) even when the first attempt died.
      if (isProcessing) {
        if (stale) {
          // Atomically reclaim the abandoned claim: the conditional DELETE
          // matches only a row that is still "processing" and still past the
          // abandonment cutoff, so exactly one concurrent delivery can win it.
          // The winner re-claims and processes the event inline instead of
          // waiting out another Stripe redelivery cycle; losers (and any fresh
          // redelivery that lands between our delete and re-claim) hit the
          // duplicate path and 503, so the event is still processed exactly
          // once end to end.
          const cutoff = new Date(Date.now() - abandonedAfterMs);
          const [reclaimed] = await drizzle
            .delete(schema.stripeEvents)
            .where(
              and(
                eq(schema.stripeEvents.eventId, idempotencyKey),
                eq(schema.stripeEvents.status, "processing"),
                lt(schema.stripeEvents.processedAt, cutoff),
              ),
            )
            .returning({ eventId: schema.stripeEvents.eventId })
            .catch(() => [] as Array<{ eventId: string }>);
          if (reclaimed) {
            log.warn("Reclaimed abandoned Stripe webhook claim; processing inline", {
              eventId: idempotencyKey,
              eventType: event.type,
            });
            await drizzle.insert(schema.stripeEvents).values({
              eventId: idempotencyKey,
              eventType: event.type,
              status: "processing",
            });
            claimed = true;
          } else {
            log.warn("Stripe webhook still processing, asking Stripe to retry", {
              eventId: idempotencyKey,
              eventType: event.type,
            });
            throw AppError.fromHttpStatus(503, "Prior delivery did not complete. Retry.");
          }
        } else {
          log.warn("Stripe webhook still processing, asking Stripe to retry", {
            eventId: idempotencyKey,
            eventType: event.type,
          });
          throw AppError.fromHttpStatus(503, "Prior delivery did not complete. Retry.");
        }
      }

      // A successful stale-claim reclaim above sets claimed=true and must fall
      // through to the handler; the branches below only apply to duplicates we
      // did not reclaim.
      if (!claimed) {
        if (prior?.status === "processed") {
          log.info("Stripe webhook duplicate event ignored", {
            eventId: idempotencyKey,
            eventType: event.type,
            priorStatus: prior.status,
          });
          return res.json({ received: true, duplicate: true });
        }

        // Unknown/missing prior status — refuse to ack so Stripe retries.
        log.warn("Stripe webhook duplicate with unexpected prior status", {
          eventId: idempotencyKey,
          eventType: event.type,
          priorStatus: prior?.status ?? "unknown",
        });
        throw AppError.fromHttpStatus(503, "Webhook claim state unclear. Retry.");
      }
    }
    // Guarded on !claimed, and that guard is load-bearing. A successful
    // stale-claim reclaim above sets claimed=true intending to fall through to
    // the handler, but this catch block previously ended in an unconditional
    // throw — so the reclaim could never process anything. Worse, it had
    // already DELETEd and re-INSERTed the row, and processedAt defaults to
    // now(), so every reclaim reset the 5-minute abandonment clock immediately
    // before 503-ing. The next redelivery then found a fresh claim, 503'd
    // again, and the cycle could repeat until Stripe stopped retrying — losing
    // a paid top-up outright. Returning normally here lets execution reach the
    // handler `try` below, which is what the reclaim was written to do.
    if (!claimed) {
      log.warn("Stripe idempotency claim failed, refusing to process event", {
        error: getErrorMessage(err),
        eventId: idempotencyKey,
        eventType: event.type,
      });
      throw AppError.fromHttpStatus(503, "Webhook idempotency store unavailable. Retry later.");
    }
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;
        await fulfillStripeCheckoutSession(session, {
          providerEventId: event.id,
        });
        break;
      }
      case "checkout.session.async_payment_failed": {
        await failStripeCheckoutSession(event.data.object as Stripe.Checkout.Session);
        break;
      }
      case "charge.refunded": {
        await reverseSettledRefundsForCharge(event.data.object as Stripe.Charge, event);
        break;
      }
      case "refund.updated": {
        // A pending refund settled (or failed). Only a transition to
        // succeeded moves money; the shared routing no-ops anything already
        // reversed and throws on inconsistency, same as charge.refunded.
        const refund = event.data.object as Stripe.Refund;
        if (refund.status !== "succeeded") break;
        const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
        if (!chargeId) break;
        const charge = await stripe.charges.retrieve(chargeId);
        // Top-ups only. Subscription allowance for this event is owned by the
        // strict preflight, which keys on refund.id; the legacy fallback below
        // keys on charge.id and would double-debit the same refund.
        await reverseSettledRefundsForCharge(charge, event, false);
        break;
      }
      case "charge.dispute.created": {
        // Chargeback on a credit top-up — claw the credit back so a disputed
        // (often fraudulent) payment can't leave spendable balance behind.
        // Mirrors charge.refunded; idempotent via stripe_events + (user, ref).
        const dispute = event.data.object as Stripe.Dispute;
        const piId =
          typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id;
        if (!piId) break;
        const pi = await stripe.paymentIntents.retrieve(piId);
        if (pi.metadata?.purpose === "credit_topup") {
          const userId = pi.metadata.wireline_user_id;
          const disputedUsd = creditPortionUsd(dispute.amount ?? 0, pi);
          if (userId && disputedUsd > 0) {
            await tenantStore.run(userId, async () => {
              await reverseCredit(userId, disputedUsd, "web_topup_dispute", {
                type: "stripe_dispute",
                id: dispute.id,
                entryKind: "reversal",
                source: "stripe",
                provider: "stripe",
                providerEventId: event.id,
                providerObjectId: dispute.id,
                customerReason: "Runtime Balance dispute reversal",
                metadata: { payment_intent_id: piId },
              });
            });
          }
        } else if (dispute.charge) {
          const disputedCharge = await stripe.charges.retrieve(
            typeof dispute.charge === "string" ? dispute.charge : dispute.charge.id,
          );
          await reverseRuntimeAllowanceForCharge(disputedCharge, "dispute", dispute.id);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        // Live-video add-on is a standalone subscription sharing the customer
        // with the plan subscription. Route it through the add-on flag path
        // and skip syncSubscriptionFromStripe (which would clobber the plan
        // subscription row keyed on user_id).
        if (sub.metadata?.purpose === "live_video_addon") {
          const userId = sub.metadata.wireline_user_id;
          if (userId) {
            // Only disable on true terminal states or an explicit delete.
            // past_due / incomplete stay enabled so a temporary card decline
            // does not yank a paid feature mid-session; Stripe will fire the
            // delete event once dunning is exhausted.
            const terminal = new Set(["canceled", "incomplete_expired", "unpaid"]);
            let disable =
              event.type === "customer.subscription.deleted" || terminal.has(sub.status);
            // The flag is workspace-wide but the subscription is not, and the
            // customer can hold more than one (checkout dedupes on this same
            // flag, so a webhook delay lets a second one through). Cancelling
            // either would otherwise turn the feature off and reset EVERY agent
            // to synthetic while the survivor kept billing monthly. Ask Stripe
            // whether any live add-on remains before tearing anything down.
            const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
            if (disable && customerId) {
              try {
                const survivors = await listCurrentLiveVideoAddons(customerId, sub.id);
                if (survivors.length > 0) {
                  disable = false;
                  log.info("Live video add-on retained; another subscription is still active", {
                    userId,
                    endedSubscriptionId: sub.id,
                    survivingSubscriptionIds: survivors.map((s) => s.id),
                  });
                }
              } catch (e: any) {
                // Fail closed on the entitlement: a list failure must not keep
                // a canceled add-on switched on.
                log.error("Live video add-on survivor check failed; disabling", {
                  userId,
                  error: getErrorMessage(e),
                });
              }
            }
            await drizzle
              .update(schema.settings)
              .set({ liveVideoAddonEnabled: !disable, updatedAt: new Date() })
              .where(eq(schema.settings.userId, userId));
            // When the add-on ends, clear provider opt-in on every agent so
            // session/sample minting cannot continue on a canceled entitlement.
            if (disable) {
              await drizzle
                .update(schema.agents)
                .set({ videoPresenterProvider: "synthetic" })
                .where(eq(schema.agents.userId, userId));
            }
          }
          break;
        }
        if (event.type === "customer.subscription.created")
          (sub as unknown as Record<string, unknown>)._auditCreate = true;
        await syncSubscriptionFromStripe(sub);
        const subscriptionUserId = sub.metadata?.wireline_user_id;
        const subscriptionPlan = planById(sub.metadata?.wireline_plan);
        if (
          subscriptionUserId &&
          subscriptionPlan &&
          (sub.status === "active" || sub.status === "trialing")
        ) {
          emitServerProductEventOnce({
            event: "subscription_started",
            userId: subscriptionUserId,
            planId: subscriptionPlan.id,
            metadata: { subscription_id: sub.id, status: sub.status },
          });
          emitServerProductEventOnce({
            event: "upgrade_to_paid",
            userId: subscriptionUserId,
            planId: subscriptionPlan.id,
            metadata: { subscription_id: sub.id, status: sub.status },
          });
        }
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        log.warn("Stripe invoice payment failed", { customerId: inv.customer });
        try {
          const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
          if (customerId) {
            const [row] = await drizzle
              .select({ userId: schema.subscriptions.userId })
              .from(schema.subscriptions)
              .where(eq(schema.subscriptions.stripeCustomerId, customerId))
              .limit(1);
            if (row?.userId) {
              void auditLogger
                .logBilling("payment_failed", {
                  userId: row.userId,
                  customerId,
                  amountCents: typeof inv.amount_due === "number" ? inv.amount_due : undefined,
                  metadata: { invoice_id: inv.id, attempt_count: inv.attempt_count },
                })
                .catch((err) =>
                  log.warn("billing audit log failed", {
                    event: "payment_failed",
                    error: getErrorMessage(err),
                  }),
                );

              // Dunning email — look up user email and notify so they can
              // update their card before the account suspends.
              const [userRow] = await drizzle
                .select({ email: schema.users.email })
                .from(schema.users)
                .where(eq(schema.users.id, row.userId))
                .limit(1);
              if (userRow?.email) {
                const amountDisplay =
                  typeof inv.amount_due === "number"
                    ? `$${(inv.amount_due / 100).toFixed(2)}`
                    : "your subscription payment";
                const appUrl = (process.env.APP_URL || "https://trywireline.com").replace(
                  /\/+$/,
                  "",
                );
                const delivery = await sendPaymentFailedEmail({
                  to: userRow.email,
                  amountDisplay,
                  invoiceUrl: inv.hosted_invoice_url ?? undefined,
                  updateCardUrl: `${appUrl}/settings/billing`,
                  idempotencyKey: `stripe-payment-failed/${event.id}`,
                });
                if (!delivery.ok && delivery.disposition !== "suppressed") {
                  log.error("payment_failed dunning email not accepted", {
                    userId: row.userId,
                    provider: delivery.provider,
                    error: delivery.error,
                  });
                  throw AppError.fromHttpStatus(503, "Payment-failure notice delivery unavailable");
                }
              }
            }
          }
        } catch (err) {
          log.error("invoice.payment_failed handler error", { error: getErrorMessage(err) });
          throw err;
        }
        break;
      }
      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        try {
          const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
          if (customerId) {
            const [row] = await drizzle
              .select({ userId: schema.subscriptions.userId })
              .from(schema.subscriptions)
              .where(eq(schema.subscriptions.stripeCustomerId, customerId))
              .limit(1);
            if (row?.userId) {
              void auditLogger
                .logBilling("payment_succeeded", {
                  userId: row.userId,
                  customerId,
                  amountCents: typeof inv.amount_paid === "number" ? inv.amount_paid : undefined,
                  metadata: { invoice_id: inv.id },
                })
                .catch((err) =>
                  log.warn("billing audit log failed", {
                    event: "payment_succeeded",
                    error: getErrorMessage(err),
                  }),
                );
            }
          }
        } catch (err) {
          // Audit-only arm — money state is untouched — but a persistently
          // failing payment_succeeded record must not be invisible while its
          // payment_failed sibling logs at error.
          log.warn("payment_succeeded audit lookup failed", {
            error: getErrorMessage(err),
          });
        }
        break;
      }
      default:
        break;
    }
    // Only now is the claim a real "already handled" marker.
    await drizzle
      .update(schema.stripeEvents)
      .set({ status: "processed", processedAt: new Date() })
      .where(eq(schema.stripeEvents.eventId, idempotencyKey));
    res.json({ received: true });
  } catch (err: any) {
    log.error("Stripe webhook handler error", { error: getErrorMessage(err) });
    if (claimed) {
      try {
        await drizzle
          .delete(schema.stripeEvents)
          .where(eq(schema.stripeEvents.eventId, idempotencyKey));
      } catch {
        /* best-effort rollback */
      }
    }
    throw AppError.fromHttpStatus(500, "Webhook handler failed");
  }
});

// ─── Billing plans / checkout / portal ─────────────────────────────────────

router.get("/billing/plans", (_req: Request, res: Response) => {
  res.json({ plans: plansForClient(), stripe_configured: stripeAvailable() });
});

router.get("/billing/usage", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await getWorkspaceUsageSnapshot(req.user!.id);
    res.json(snapshot);
  } catch (err) {
    if (err instanceof AppError) throw err;
    log.error("/billing/usage failed", { error: getErrorMessage(err) });
    throw AppError.fromHttpStatus(500, "Failed to load usage snapshot");
  }
});

/**
 * Verify a Stripe customer actually exists in the current Stripe account.
 * Mirrors the preflight that /billing/portal does implicitly (via
 * billingPortal.sessions.create) so /billing/status can surface the
 * same STRIPE_CUSTOMER_MISSING signal instead of optimistically
 * reporting has_customer=true based on a stale DB column.
 *
 * Returns:
 *   "present"  — customer exists and isn't deleted
 *   "deleted"  — customer exists but is marked deleted in Stripe
 *   "missing"  — Stripe says "No such customer" (test/live mismatch,
 *                or the customer was wiped from the Dashboard)
 *   "unknown"  — Stripe API failed for some other reason; don't lie
 *                about presence, surface the uncertainty.
 *
 * This adds one Stripe API round-trip (~150–300ms) per /billing/status
 * call. The admin dashboard hits /status on mount, not on every render,
 * so the cost is bounded. Caching can come later if Sentry shows the
 * Stripe latency dominating dashboard time-to-interactive.
 */
/**
 * Reverse every settled refund on a charge, keyed per refund.id — shared by
 * `charge.refunded` and `refund.updated`. The second event is the only
 * signal Stripe sends when a PENDING refund later settles: `charge.refunded`
 * fires at creation, its succeeded-only filter correctly yields nothing for an
 * unsettled refund, and Stripe's redelivery retries stop after ~3 days — a
 * card refund that takes an issuer 5-10 days to clear would otherwise never be
 * clawed back and the credit would stay spendable forever. Every reversal is
 * idempotent under the (user, ref=refund.id) ledger index, so re-running the
 * full routing for each refund-lifecycle event is safe by construction.
 */
async function reverseSettledRefundsForCharge(
  charge: Stripe.Charge,
  event: Stripe.Event,
  /*
   * Whether this event may also reverse a SUBSCRIPTION charge's Runtime
   * Allowance through the legacy reverser below.
   *
   * Only `charge.refunded` may, and only as a fallback: the strict preflight
   * (stripe-runtime-allowance-retry.ts) owns non-top-up refunds and consumes
   * those events before this router sees them, keying every reversal on
   * refund.id. The legacy reverser falls back to charge.id whenever the Charge
   * arrives without an expanded refunds list — the default under the pinned
   * API version — and that key is disjoint from refund.id, so the
   * (user, ref_type, ref_id) unique index cannot dedupe the pair. Letting
   * `refund.updated` reach it would debit a paying customer twice for
   * one refund and could drive the wallet negative into a hard 402.
   */
  allowSubscriptionFallback = true,
): Promise<void> {
  // Claw back a refunded/disputed web credit top-up so a refund can't
  // leave the purchased credit sitting in the wallet. Only top-ups carry
  // purpose=credit_topup on their PaymentIntent. Idempotent via the
  // stripe_events guard in the webhook handler + the (user, ref) ledger
  // index.
  const piId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!piId) return;
  const pi = await stripe.paymentIntents.retrieve(piId);
  if (pi.metadata?.purpose === "credit_topup") {
    const userId = pi.metadata.wireline_user_id;
    // Reverse each refund keyed on its OWN id. charge.amount_refunded is
    // Stripe's cumulative total, so keying the ledger entry on charge.id
    // would let the (user, ref) unique index drop every refund after the
    // first — leaving later partial/full refunds spendable as balance.
    const refunds = charge.refunds?.data ?? [];
    const reversible = refunds.filter(
      (r) => (!r.status || r.status === "succeeded") && (r.amount ?? 0) > 0,
    );
    if (userId && reversible.length) {
      await tenantStore.run(userId, async () => {
        for (const refund of reversible) {
          await reverseCredit(
            userId,
            creditPortionUsd(refund.amount ?? 0, pi),
            "web_topup_refund",
            {
              type: "stripe_refund",
              id: refund.id,
              entryKind: "refund",
              source: "stripe",
              provider: "stripe",
              providerEventId: event.id,
              providerObjectId: refund.id,
              customerReason: "Runtime Balance refund",
              metadata: { payment_intent_id: piId, charge_id: charge.id },
            },
          );
        }
      });
    } else if (userId && (charge.amount_refunded ?? 0) > 0) {
      // The event omitted the inline refunds list (the pinned API version
      // no longer expands charge.refunds by default). Fetch them so each
      // partial refund is reversed once, keyed on its OWN id — reversing
      // the cumulative amount_refunded under charge.id would collide on
      // the (user, ref) unique index and silently drop every partial
      // refund after the first, leaving refunded money spendable.
      // A transient list failure must THROW (the handler releases the
      // stripe_events claim and 500s, so Stripe redelivers cleanly) —
      // degrading to the cumulative charge.id reversal here would stack
      // on top of any per-refund.id rows already written by earlier
      // events and over-debit the tenant (different ref keys defeat the
      // (user, ref) dedupe).
      const listed = await stripe.refunds
        .list({ charge: charge.id, limit: 100 })
        .then((r) =>
          r.data.filter((x) => (!x.status || x.status === "succeeded") && (x.amount ?? 0) > 0),
        );
      // The comment above is the whole rule, so honour it here too. The
      // filter drops pending/failed refunds, so an empty list is the
      // ordinary outcome for a refund Stripe has accepted but not yet
      // settled — and the cumulative charge.id fallback that used to sit
      // here fired on exactly that case. When the refund later settles,
      // `charge.refunded` redelivers, the per-refund.id reversal runs,
      // and because the two ref keys are disjoint under the (user, ref)
      // unique index nothing dedupes them: the tenant is debited twice
      // and the wallet can go negative into a hard 402. Throwing releases
      // the claim and lets Stripe redeliver once the refund is real.
      if (!listed.length) {
        throw new Error(
          `Stripe charge ${charge.id} reports refunded funds but no succeeded refund objects.`,
        );
      }
      await tenantStore.run(userId, async () => {
        for (const refund of listed) {
          await reverseCredit(
            userId,
            creditPortionUsd(refund.amount ?? 0, pi),
            "web_topup_refund",
            {
              type: "stripe_refund",
              id: refund.id,
              entryKind: "refund",
              source: "stripe",
              provider: "stripe",
              providerEventId: event.id,
              providerObjectId: refund.id,
              customerReason: "Runtime Balance refund",
              metadata: { payment_intent_id: piId, charge_id: charge.id },
            },
          );
        }
      });
    }
  } else {
    // Not a top-up — but a subscription invoice charge funds the Runtime
    // Allowance, which was granted on subscription sync and never came
    // back on a refund. Reverse it under the refund's own id.
    if (!allowSubscriptionFallback) return;
    await reverseRuntimeAllowanceForCharge(charge, "refund");
  }
}

async function verifyStripeCustomer(
  customerId: string,
): Promise<"present" | "deleted" | "missing" | "unknown"> {
  try {
    const cust = await stripe.customers.retrieve(customerId);
    // The retrieve() return type is Customer | DeletedCustomer — the
    // discriminator is `deleted: true` on the deleted variant.
    if ((cust as Stripe.DeletedCustomer).deleted) return "deleted";
    return "present";
  } catch (e: any) {
    if (
      e?.code === "resource_missing" ||
      e?.type === "StripeInvalidRequestError" ||
      /No such customer/i.test(e?.message || "")
    ) {
      return "missing";
    }
    log.warn("Stripe customer verify failed", {
      customerId,
      code: e?.code,
      type: e?.type,
      message: getErrorMessage(e),
    });
    return "unknown";
  }
}

router.get(
  "/billing/status",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      // Keep tenant reads sequential. Every root Drizzle query checks out its own
      // tenant-scoped Pool client, and the serverless pool is intentionally capped
      // at five connections. The previous Promise.all consumed four clients for a
      // single request (getIncludedPhoneLineSlots performs two more reads), so two
      // concurrent dashboard mounts could exhaust the pool and make this endpoint
      // fail after its 5s checkout timeout. Sequential reads preserve honest
      // all-or-nothing status semantics while leaving headroom for other requests.
      const subRows = await drizzle
        .select({
          plan: schema.subscriptions.plan,
          status: schema.subscriptions.status,
          currentPeriodEnd: schema.subscriptions.currentPeriodEnd,
          cancelAtPeriodEnd: schema.subscriptions.cancelAtPeriodEnd,
          stripeCustomerId: schema.subscriptions.stripeCustomerId,
          stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
          updatedAt: schema.subscriptions.updatedAt,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, req.user.id))
        .limit(1);
      const agentCounts = await drizzle
        .select({ val: count() })
        .from(schema.agents)
        .where(eq(schema.agents.userId, req.user.id));
      const phoneCounts = await drizzle
        .select({ val: count() })
        .from(schema.phoneNumbers)
        .where(eq(schema.phoneNumbers.userId, req.user.id));
      const entitlementSlots = await getIncludedPhoneLineSlots(req.user.id);
      const sub = subRows[0];
      const agentCount = Number(agentCounts[0]?.val || 0);
      const phoneLineCount = Number(phoneCounts[0]?.val || 0);
      const planMeta = sub?.plan ? planById(sub.plan) : null;

      // Reconcile has_customer with the same reality /billing/portal sees.
      // Without this, a row whose stripe_customer_id points at a customer
      // that's been deleted (or lives in the other Stripe mode) reports
      // has_customer=true here and STRIPE_CUSTOMER_MISSING at /portal —
      // confusing dead-end UX. Phase 3 fix.
      let customerState: "present" | "deleted" | "missing" | "unknown" | "none" = "none";
      if (sub?.stripeCustomerId && stripeAvailable()) {
        customerState = await verifyStripeCustomer(sub.stripeCustomerId);
      }
      const hasCustomer = customerState === "present";

      // Trial state lives on wireline_settings (separate from Stripe
      // subscription state above). New tenants land here directly via
      // authService.signUp → startTrialForUser. Stripe-converted
      // tenants stay in 'active' here forever; the subscription block
      // above is the source of truth for paid state. The two blocks
      // are intentionally independent so the modal and banner can
      // surface trial countdown / soft-cap warnings BEFORE any
      // subscription exists.
      const [settingsRow] = await drizzle
        .select({
          status: schema.settings.subscriptionStatus,
          trialEndsAt: schema.settings.trialEndsAt,
          trialOutboundCount: schema.settings.trialOutboundCount,
          signupPlanInterest: schema.settings.signupPlanInterest,
          signupWedge: schema.settings.signupWedge,
          acquisitionSource: schema.settings.acquisitionSource,
          acquisitionMedium: schema.settings.acquisitionMedium,
          acquisitionCampaign: schema.settings.acquisitionCampaign,
          extraAgents: schema.settings.extraAgents,
          maxAgents: schema.settings.maxAgents,
        })
        .from(schema.settings)
        .where(eq(schema.settings.userId, req.user.id))
        .limit(1);

      let trial: {
        status: string;
        days_left: number | null;
        ends_at: string | null;
        outbound_used: number;
        outbound_cap: number;
        agents_cap: number;
        agents_used: number;
      } | null = null;
      if (settingsRow?.status === "trialing" || settingsRow?.status === "trial_expired") {
        const { TRIAL_MAX_AGENTS, TRIAL_MAX_OUTBOUND } = await import("../lib/trial-gate");
        const endsAt = settingsRow.trialEndsAt as Date | string | null | undefined;
        const endsDate = endsAt instanceof Date ? endsAt : endsAt ? new Date(endsAt as any) : null;
        const daysLeft = endsDate
          ? Math.max(0, Math.ceil((endsDate.getTime() - Date.now()) / 86_400_000))
          : null;
        // Lazy-expire mirroring the trial-gate middleware: if endsAt
        // is in the past but the sweep hasn't flipped status yet, show
        // expired here so the banner / modal copy agrees with reality.
        const effectiveStatus =
          settingsRow.status === "trialing" && endsDate && endsDate.getTime() < Date.now()
            ? "trial_expired"
            : settingsRow.status;
        trial = {
          status: effectiveStatus,
          days_left: daysLeft,
          ends_at: endsDate ? endsDate.toISOString() : null,
          outbound_used: settingsRow.trialOutboundCount ?? 0,
          outbound_cap: TRIAL_MAX_OUTBOUND,
          agents_cap: TRIAL_MAX_AGENTS,
          agents_used: agentCount,
        };
      }

      // Email-verification state — surfaces to EmailVerifyBanner so
      // it can show/hide without a separate /api/me call.
      let emailVerified = true;
      try {
        const [u] = await drizzle
          .select({ verifiedAt: schema.users.emailVerifiedAt })
          .from(schema.users)
          .where(eq(schema.users.id, req.user.id))
          .limit(1);
        emailVerified = !!u?.verifiedAt;
      } catch {
        // Fail-open in the banner: if the DB lookup hiccups, assume
        // verified so we don't false-flag a real user.
        emailVerified = true;
      }

      res.json({
        stripe_configured: stripeAvailable(),
        agent_count: agentCount ?? 0,
        phone_lines_used: phoneLineCount ?? 0,
        phone_lines_included: entitlementSlots,
        email_verified: emailVerified,
        subscription: sub
          ? {
              plan: sub.plan,
              plan_id: sub.plan,
              plan_name: planMeta?.name || null,
              max_agents: (() => {
                const catalog =
                  (planMeta?.max_agents ?? 0) + Math.max(0, settingsRow?.extraAgents ?? 0);
                const stored =
                  typeof settingsRow?.maxAgents === "number" ? settingsRow.maxAgents : 0;
                return Math.max(catalog, stored) || planMeta?.max_agents || null;
              })(),
              extra_agents: settingsRow?.extraAgents ?? 0,
              status: sub.status,
              current_period_end: sub.currentPeriodEnd,
              cancel_at_period_end: !!sub.cancelAtPeriodEnd,
              has_customer: hasCustomer,
              customer_state: customerState,
              has_subscription: !!sub.stripeSubscriptionId,
              updated_at: sub.updatedAt,
            }
          : null,
        trial,
        signup_intent: settingsRow
          ? {
              plan_id: settingsRow.signupPlanInterest,
              wedge: settingsRow.signupWedge,
              utm_source: settingsRow.acquisitionSource,
              utm_medium: settingsRow.acquisitionMedium,
              utm_campaign: settingsRow.acquisitionCampaign,
            }
          : null,
      });
    } catch (e: any) {
      log.error("Failed to load status", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Failed to load status");
    }
  },
);

/**
 * GET /api/admin/stripe-customer-audit (owner-only)
 *
 * One-shot diagnostic that walks every wireline_subscriptions row with
 * a stripe_customer_id and asks Stripe whether that customer exists.
 * Reports counts only — does NOT auto-fix anything, so the founder can
 * decide whether to reach out to affected accounts or wait for them to
 * surface organically through /billing/portal failures.
 *
 * Output shape:
 *   { total_with_customer_id, present, deleted, missing, unknown,
 *     missing_sample: [{ user_id, stripe_customer_id }, ...] }
 *
 * `missing_sample` is capped at 10 rows so the response stays small
 * even if the disagreement is widespread (e.g., whole-mode flip).
 */
router.get(
  "/admin/stripe-customer-audit",
  authenticateUser,
  requirePlatformAdmin,
  async (req: AuthenticatedRequest, res: Response) => {
    if (!stripeAvailable()) {
      throw AppError.fromHttpStatus(503, "Stripe not configured.");
    }
    try {
      const rows = await drizzle
        .select({
          userId: schema.subscriptions.userId,
          stripeCustomerId: schema.subscriptions.stripeCustomerId,
        })
        .from(schema.subscriptions);

      const withId = rows.filter((r) => r.stripeCustomerId);
      const tally = { present: 0, deleted: 0, missing: 0, unknown: 0 };
      const missingSample: { user_id: string; stripe_customer_id: string }[] = [];

      // Serialize the Stripe calls so we don't burst against the API
      // rate limit. The audit is owner-triggered and infrequent so
      // total wall-clock is fine; rate-limit safety beats parallelism.
      for (const row of withId) {
        const state = await verifyStripeCustomer(row.stripeCustomerId!);
        tally[state] += 1;
        if (state === "missing" && missingSample.length < 10) {
          missingSample.push({
            user_id: row.userId,
            stripe_customer_id: row.stripeCustomerId!,
          });
        }
      }

      return res.json({
        total_with_customer_id: withId.length,
        ...tally,
        missing_sample: missingSample,
        note:
          "missing = stripe_customer_id in our DB references a Stripe customer that no longer exists in the current Stripe account. " +
          "Common causes: test/live key mismatch, customer deleted via Stripe Dashboard. " +
          "Affected accounts will see STRIPE_CUSTOMER_MISSING from /billing/portal and (post Phase 3) has_customer=false in /billing/status.",
      });
    } catch (e: any) {
      log.error("Stripe customer audit failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Audit failed");
    }
  },
);

router.post(
  "/billing/live-video-checkout",
  authenticateUser,
  enforceLaunchHardGate,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!stripeAvailable()) throw AppError.fromHttpStatus(503, "Stripe not configured.");
      if (!isLiveVideoCatalogReady()) {
        return res.status(503).json({
          code: "LIVE_VIDEO_CATALOG_UNAVAILABLE",
          error:
            "Live talking-head video is retired. Identity badges stay. Phone, email, and text are unaffected.",
        });
      }
      // Canonical env is STRIPE_LIVE_VIDEO_ADDON_PRICE_ID; STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID
      // is accepted as an alias so ops can standardize on the SKU-shaped name.
      const configuredPriceId =
        process.env.STRIPE_LIVE_VIDEO_ADDON_PRICE_ID ||
        process.env.STRIPE_LIVE_VIDEO_MONTHLY_PRICE_ID;
      if (!configuredPriceId) {
        return res.status(503).json({
          code: "SERVICE_UNAVAILABLE",
          error: "Live video add-on is not configured (STRIPE_LIVE_VIDEO_ADDON_PRICE_ID).",
        });
      }
      const [row] = await drizzle
        .select({
          stripeCustomerId: schema.subscriptions.stripeCustomerId,
          liveVideoAddonEnabled: schema.settings.liveVideoAddonEnabled,
          planId: schema.subscriptions.plan,
          stripeStatus: schema.subscriptions.status,
          subscriptionStatus: schema.settings.subscriptionStatus,
        })
        .from(schema.settings)
        .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
        .where(eq(schema.settings.userId, req.user.id))
        .limit(1);

      if (row?.liveVideoAddonEnabled) {
        return res.status(409).json({
          code: "LIVE_VIDEO_ALREADY_ENABLED",
          error: "Live video add-on is already active on this workspace.",
        });
      }

      const plan = planById(row?.planId);
      const stripeActive = row?.stripeStatus === "active" || row?.stripeStatus === "trialing";
      const settingsActive =
        row?.subscriptionStatus === "active" || row?.subscriptionStatus === "trialing";
      if (!plan || plan.id === "personal" || !stripeActive || !settingsActive) {
        return res.status(402).json({
          code: "LIVE_VIDEO_BASE_PLAN_REQUIRED",
          error: "Activate a paid Wireline plan before adding live video.",
        });
      }

      const priceId = await validateFounderCatalogPriceId(configuredPriceId);
      if (!priceId) {
        return res.status(503).json({
          code: "SERVICE_UNAVAILABLE",
          error:
            "Live video add-on price is not in the current founder catalog. Run stripe:setup and update Vercel.",
        });
      }

      let customerId = row?.stripeCustomerId || null;
      if (!customerId) {
        const customer = await stripe.customers.create(
          {
            email: req.user.email,
            metadata: { wireline_user_id: req.user.id },
          },
          { idempotencyKey: `wireline-live-video-customer-${req.user.id}` },
        );
        customerId = customer.id;
        await drizzle
          .insert(schema.subscriptions)
          .values({ userId: req.user.id, stripeCustomerId: customerId, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: schema.subscriptions.userId,
            set: { stripeCustomerId: customerId, updatedAt: new Date() },
          });
      }

      // The local flag checked above is written only by the webhook, so during
      // delivery lag (or from a second tab) it still reads false after a
      // completed checkout. Nothing downstream ever detects or cancels a
      // duplicate, so two subscriptions would bill this customer monthly
      // forever. Stripe is the only authority on what they already have.
      const existingAddons = await listCurrentLiveVideoAddons(customerId);
      if (existingAddons.length > 0) {
        // Stripe truth can arrive before either our webhook or the success
        // redirect. Repair the entitlement here as well as refusing another
        // subscription, otherwise a paid customer with a lost webhook stays
        // disabled forever while every retry correctly returns 409.
        const existingOperationId = existingAddons
          .map((subscription) => subscription.metadata?.wireline_checkout_operation_id?.trim())
          .find((candidate) => candidate && CHECKOUT_OPERATION_ID.test(candidate));
        await tenantStore.run(req.user.id, async () => {
          await drizzle
            .update(schema.settings)
            .set({ liveVideoAddonEnabled: true, updatedAt: new Date() })
            .where(eq(schema.settings.userId, req.user.id));
          if (existingOperationId) {
            await drizzle
              .update(checkoutOperations)
              .set({ status: "completed", failureCode: null, updatedAt: new Date() })
              .where(
                and(
                  eq(checkoutOperations.id, existingOperationId),
                  eq(checkoutOperations.userId, req.user.id),
                  inArray(checkoutOperations.status, ACTIVE_CHECKOUT_OPERATION_STATES),
                ),
              );
          }
        });
        return res.status(409).json({
          code: "LIVE_VIDEO_ALREADY_ENABLED",
          error: "Live video add-on is already active on this workspace.",
        });
      }

      const appUrl = resolveCanonicalAppUrl();
      if ("error" in appUrl) {
        return res
          .status(503)
          .json({ error: "Billing is unavailable: APP_URL is not configured." });
      }
      const base = appUrl.url;
      await drizzle
        .update(checkoutOperations)
        .set({ status: "expired", updatedAt: new Date() })
        .where(
          and(
            eq(checkoutOperations.userId, req.user.id),
            inArray(checkoutOperations.status, ACTIVE_CHECKOUT_OPERATION_STATES),
            sql`${checkoutOperations.expiresAt} < clock_timestamp()`,
          ),
        );

      let operationId = await insertLiveVideoCheckoutOperation(req.user.id);
      let operationCustomerId: string | null = null;
      let resumed = false;

      if (!operationId) {
        const [active] = await drizzle
          .select({
            id: checkoutOperations.id,
            planId: checkoutOperations.planId,
            billingInterval: checkoutOperations.billingInterval,
            status: checkoutOperations.status,
            stripeCustomerId: checkoutOperations.stripeCustomerId,
            stripeCheckoutSessionId: checkoutOperations.stripeCheckoutSessionId,
            checkoutUrl: checkoutOperations.checkoutUrl,
          })
          .from(checkoutOperations)
          .where(
            and(
              eq(checkoutOperations.userId, req.user.id),
              inArray(checkoutOperations.status, ACTIVE_CHECKOUT_OPERATION_STATES),
            ),
          )
          .limit(1);
        const sameFlow =
          active?.planId === LIVE_VIDEO_CHECKOUT_OPERATION_PLAN &&
          active?.billingInterval === "month";

        if (active?.status === "open") {
          let remoteSession: Stripe.Checkout.Session | null = null;
          if (active.stripeCheckoutSessionId) {
            try {
              remoteSession = await stripe.checkout.sessions.retrieve(
                active.stripeCheckoutSessionId,
              );
            } catch (error) {
              if (!isMissingStripeResource(error)) throw error;
            }
          }

          if (sameFlow && remoteSession?.status === "open" && remoteSession.url) {
            if (remoteSession.url !== active.checkoutUrl) {
              await markLiveVideoCheckoutOperation(active.id, {
                status: "open",
                stripeCustomerId: active.stripeCustomerId,
                stripeCheckoutSessionId: remoteSession.id,
                checkoutUrl: remoteSession.url,
                failureCode: null,
              });
            }
            return res.json({ url: remoteSession.url, reused: true, operation_id: active.id });
          }

          if (remoteSession?.status === "open") {
            return res.status(409).json({
              code: "CHECKOUT_ALREADY_IN_PROGRESS",
              error: "Another checkout is already open. Complete or cancel it first.",
              operation_id: active.id,
            });
          }

          await markLiveVideoCheckoutOperation(active.id, {
            status: remoteSession?.status === "complete" ? "completed" : "expired",
            failureCode: null,
          });
          if (remoteSession?.status === "complete") {
            return res.status(409).json({
              code: "LIVE_VIDEO_CHECKOUT_COMPLETED",
              error: "Live video checkout is already complete and is being reconciled.",
              operation_id: active.id,
            });
          }
          operationId = await insertLiveVideoCheckoutOperation(req.user.id);
          if (!operationId) {
            return res.status(409).json({
              code: "CHECKOUT_ALREADY_IN_PROGRESS",
              error: "Another checkout request is being prepared. Try again in a moment.",
            });
          }
        } else if (active?.status === "creating" && sameFlow) {
          operationId = active.id;
          operationCustomerId = active.stripeCustomerId || null;
          resumed = true;
        } else {
          return res.status(409).json({
            code: "CHECKOUT_ALREADY_IN_PROGRESS",
            error: "Another checkout request is being prepared. Try again after it completes.",
            operation_id: active?.id,
          });
        }
      }

      const checkoutCustomerId = operationCustomerId || customerId;

      const addonMeta = {
        wireline_user_id: req.user.id,
        wireline_checkout_operation_id: operationId,
        purpose: "live_video_addon",
      };
      let checkoutAttempted = false;
      let checkoutResolved = false;
      let createdSession: { id: string; url: string } | null = null;

      try {
        await markLiveVideoCheckoutOperation(operationId, {
          status: "creating",
          stripeCustomerId: checkoutCustomerId,
          failureCode: null,
        });
        checkoutAttempted = true;
        const session = await stripe.checkout.sessions.create(
          {
            mode: "subscription",
            integration_identifier: stripeCheckoutIntegrationIdentifier("live_video", operationId),
            customer: checkoutCustomerId,
            line_items: [{ price: priceId, quantity: 1 }],
            ...stripeCheckoutTaxConfig(),
            customer_update: { address: "auto", name: "auto" },
            // Parity with the plan checkout — promo codes work on add-ons too.
            allow_promotion_codes: true,
            client_reference_id: req.user.id,
            success_url: `${base}/settings/billing?live_video=success&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${base}/settings/billing?live_video=canceled`,
            metadata: addonMeta,
            subscription_data: { metadata: addonMeta },
          },
          { idempotencyKey: `wireline-live-video-checkout-${operationId}` },
        );
        checkoutResolved = true;
        if (!session.url) {
          await markLiveVideoCheckoutOperation(operationId, {
            status: "creating",
            stripeCustomerId: checkoutCustomerId,
            stripeCheckoutSessionId: session.id,
            failureCode: "stripe_checkout_url_missing",
          });
          return res.status(202).json({
            code: "CHECKOUT_RECONCILING",
            error: "Stripe is preparing the hosted checkout. Retry to resume it safely.",
            operation_id: operationId,
          });
        }
        createdSession = { id: session.id, url: session.url };
        await markLiveVideoCheckoutOperation(operationId, {
          status: "open",
          stripeCustomerId: checkoutCustomerId,
          stripeCheckoutSessionId: session.id,
          checkoutUrl: session.url,
          failureCode: null,
        });

        return res.json({
          url: session.url,
          operation_id: operationId,
          ...(resumed ? { resumed: true } : {}),
        });
      } catch (error) {
        if (createdSession) {
          await markLiveVideoCheckoutOperation(operationId, {
            status: "open",
            stripeCustomerId: checkoutCustomerId,
            stripeCheckoutSessionId: createdSession.id,
            checkoutUrl: createdSession.url,
            failureCode: "post_stripe_persistence_failed",
          }).catch(() => {});
          log.error("Live Video Checkout exists but operation persistence failed", {
            operationId,
            sessionId: createdSession.id,
            userId: req.user.id,
            error: getErrorMessage(error),
          });
          return res.json({
            url: createdSession.url,
            operation_id: operationId,
            warning: "Checkout is ready; Wireline is reconciling its local billing record.",
          });
        }

        if (checkoutAttempted && !checkoutResolved && isAmbiguousStripeCheckoutError(error)) {
          await markLiveVideoCheckoutOperation(operationId, {
            status: "creating",
            stripeCustomerId: checkoutCustomerId,
            failureCode: "stripe_checkout_outcome_unknown",
          }).catch(() => {});
          log.warn("Live Video Checkout outcome is ambiguous; operation remains resumable", {
            operationId,
            userId: req.user.id,
            error: getErrorMessage(error),
          });
          return res.status(202).json({
            code: "CHECKOUT_RECONCILING",
            error:
              "Stripe did not return a definitive result. Retry to resume this checkout safely.",
            operation_id: operationId,
          });
        }

        await failCreatingLiveVideoCheckoutOperation(operationId, checkoutCustomerId).catch(
          () => {},
        );
        throw AppError.fromHttpStatus(502, "Live video checkout could not be prepared.");
      }
    } catch (e: any) {
      log.error("Live video checkout creation failed", { error: getErrorMessage(e) });
      if (e instanceof AppError) throw e;
      throw AppError.fromHttpStatus(500, "Live video checkout failed");
    }
  },
);

/**
 * Read-only Extra Agent billing summary.
 *
 * POST /api/billing/extra-agents is owned exclusively by
 * extra-agent-billing-atomic-routes.ts, which settles and verifies Stripe
 * before changing local capacity. Keeping this router read-only prevents
 * registration-order changes from reviving a shadow financial write path.
 */
router.get(
  "/billing/extra-agents",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const [row] = await drizzle
        .select({
          plan_id: schema.subscriptions.plan,
          extra_agents: schema.settings.extraAgents,
        })
        .from(schema.settings)
        .leftJoin(schema.subscriptions, eq(schema.subscriptions.userId, schema.settings.userId))
        .where(eq(schema.settings.userId, req.user!.id))
        .limit(1);
      const plan = planById(row?.plan_id || "personal");
      res.json({
        plan_id: plan?.id || "personal",
        plan_name: plan?.name || "Personal",
        included_agents: plan?.max_agents ?? 1,
        extra_agents: row?.extra_agents ?? 0,
        extra_agent_price_usd: plan?.extra_agent_price_usd ?? null,
        configured: !!plan?.extraAgentPriceIdEnv && !!process.env[plan.extraAgentPriceIdEnv],
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("/billing/extra-agents GET failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to load extra-agent state");
    }
  },
);

export default router;
