import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe events and subscription payloads are vendor-defined JSON. */
import express, { Request, Response } from "express";
import { drizzle, log, tenantStore, auditLogger } from "../lib/server-context";
import * as schema from "../db/schema";
import { and, eq, inArray, count, sql } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import { getErrorMessage } from "../lib/server-utils";
import {
  stripe,
  stripeAvailable,
  syncSubscriptionFromStripe,
  stripeSubscriptionIdForInvoice,
  stripeCheckoutIntegrationIdentifier,
  stripeCheckoutTaxConfig,
  isMissingStripeResource,
} from "../lib/stripe-helpers";
import { sendPaymentFailedEmail } from "../lib/email-service";
import { planById, plansForClient, FOUNDER_CATALOG_VERSION } from "../lib/plan-catalog";
import { getIncludedPhoneLineSlots } from "../lib/phone-line-entitlements";
import { getTenantChannelEntitlements } from "../lib/channel-entitlements";
import { getWorkspaceUsageSnapshot } from "../lib/workspace-usage-snapshot";
import {
  listSucceededRefunds,
  reverseSubscriptionRuntimeAllowanceForChargeStrict,
} from "../middleware/stripe-runtime-allowance-retry";
import Stripe from "stripe";
import type { AuthenticatedRequest } from "../types/auth";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { selfServeBillingEnabled } from "../lib/billing-release";
import { usageBillingEnabled, usageCheckoutConfigured } from "../lib/usage-billing-config";
import { USAGE_MAX_MONTHLY_CAP_USD, PUBLIC_USAGE_TIERS } from "../lib/usage-billing-catalog";
import { isLaunchHardBlocked } from "../lib/launch-readiness";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import { isLiveVideoCatalogReady } from "../lib/video-presenter/live-video-entitlements";
import { resolveAgentEntitlement } from "../lib/agent-entitlements";
import { isOwnerEmail } from "../lib/auth-service";
import {
  failStripeCheckoutSession,
  fulfillStripeCheckoutSession,
} from "../lib/stripe-checkout-fulfillment";
import { checkoutOperations } from "../db/security-schema";
import { listCurrentLiveVideoAddons } from "../lib/stripe-live-video-addon";
import { enforcePendingDeletionBillingForSubscription } from "../lib/account-deletion-billing";
import { assertLiveExternalActionAllowed } from "../lib/account-environment-policy";
import {
  claimStripeEvent,
  completeStripeEventClaim,
  releaseStripeEventClaim,
  type StripeEventClaimOwnership,
} from "../lib/stripe-event-claim";
import { reconcilePaidAllowanceFundingForCharge } from "../lib/stripe-paid-allowance-funding";
import { reconcileStripeTopUpRefunds } from "../lib/stripe-topup-refund-reconciliation";

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
  let claim: StripeEventClaimOwnership | null = null;
  try {
    const result = await claimStripeEvent(idempotencyKey, event.type);
    if (result.kind === "already_processed") {
      log.info("Stripe webhook duplicate event ignored", {
        eventId: idempotencyKey,
        eventType: event.type,
        priorStatus: "processed",
      });
      return res.json({ received: true, duplicate: true });
    }
    if (result.kind === "in_flight") {
      log.warn("Stripe webhook still processing, asking Stripe to retry", {
        eventId: idempotencyKey,
        eventType: event.type,
      });
      throw AppError.fromHttpStatus(503, "Prior delivery did not complete. Retry.");
    }
    claim = result.claim;
  } catch (err: any) {
    if (err instanceof AppError) throw err;
    log.warn("Stripe idempotency claim failed, refusing to process event", {
      error: getErrorMessage(err),
      eventId: idempotencyKey,
      eventType: event.type,
    });
    throw AppError.fromHttpStatus(503, "Webhook idempotency store unavailable. Retry later.");
  }
  if (!claim) {
    throw AppError.fromHttpStatus(503, "Webhook claim ownership unavailable. Retry later.");
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
        // A failed/canceled refund can return a previously settled debit.
        // Both allowance and standalone top-up recovery use canonical receipts.
        const refund = event.data.object as Stripe.Refund;
        const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
        if (!chargeId) break;
        if (refund.status !== "succeeded") {
          if (refund.status === "failed" || refund.status === "canceled") {
            const charge = await stripe.charges.retrieve(chargeId);
            await reverseSettledRefundsForCharge(charge, event, false);
          }
          break;
        }
        const charge = await stripe.charges.retrieve(chargeId);
        // Top-ups only. Subscription allowance for this event is owned by the
        // strict preflight, which keys on refund.id; the legacy fallback below
        // keys on charge.id and would double-debit the same refund.
        await reverseSettledRefundsForCharge(charge, event, false);
        break;
      }
      case "refund.failed": {
        // Fallback mounts also restore exact posted standalone top-up debits.
        const refund = event.data.object as Stripe.Refund;
        const chargeId = typeof refund.charge === "string" ? refund.charge : refund.charge?.id;
        if (chargeId) {
          const charge = await stripe.charges.retrieve(chargeId);
          await reverseSettledRefundsForCharge(charge, event, false);
        }
        break;
      }
      case "charge.dispute.created": {
        // Notification only. A dispute can begin as an inquiry without any
        // funds moving. The registered financial-integrity preflight consumes
        // this event and accounts only from Stripe's authoritative
        // funds_withdrawn/funds_reinstated balance movements.
        break;
      }
      case "charge.dispute.funds_withdrawn":
      case "charge.dispute.funds_reinstated": {
        // These events must never fall through and be marked processed without
        // the strict Runtime Balance mutations in stripeRuntimeAllowanceRetryPreflight.
        throw new Error(
          "Stripe dispute balance movement reached the legacy webhook router without preflight accounting.",
        );
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
          await enforcePendingDeletionBillingForSubscription(sub);
          break;
        }
        if (event.type === "customer.subscription.created")
          (sub as unknown as Record<string, unknown>)._auditCreate = true;
        await syncSubscriptionFromStripe(sub);
        const deletionBillingEnforced = await enforcePendingDeletionBillingForSubscription(sub);
        const subscriptionUserId = sub.metadata?.wireline_user_id;
        const subscriptionPlan = planById(sub.metadata?.wireline_plan);
        if (
          !deletionBillingEnforced &&
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
                const appUrl = resolveCanonicalAppUrl();
                if ("error" in appUrl) {
                  throw AppError.fromHttpStatus(
                    503,
                    "Payment-failure notice link is not configured",
                  );
                }
                const delivery = await sendPaymentFailedEmail({
                  userId: row.userId,
                  to: userRow.email,
                  amountDisplay,
                  invoiceUrl: inv.hosted_invoice_url ?? undefined,
                  updateCardUrl: `${appUrl.url}/settings/billing`,
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
        // A renewal rolls the period while its invoice is still a draft, so the
        // customer.subscription.updated sync cannot record the paid period.
        // This event is the first moment that invoice is paid: re-sync every
        // plan subscription so the paid-period receipt (and any scheduled
        // capacity) is recorded. Failure releases the webhook claim for retry.
        const renewedSubscriptionId = stripeSubscriptionIdForInvoice(inv);
        if (renewedSubscriptionId) {
          const renewed = await stripe.subscriptions.retrieve(renewedSubscriptionId);
          // The Live Video add-on is a standalone subscription; syncing it would
          // clobber the plan row keyed on user_id (see the subscription arm).
          if (renewed.metadata?.purpose !== "live_video_addon")
            await syncSubscriptionFromStripe(renewed);
        }
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
    // Only the still-owning attempt can turn processing into processed.
    await completeStripeEventClaim(claim);
    res.json({ received: true });
  } catch (err: any) {
    log.error("Stripe webhook handler error", { error: getErrorMessage(err) });
    if (claim) {
      try {
        await releaseStripeEventClaim(claim);
      } catch {
        /* best-effort rollback */
      }
    }
    throw AppError.fromHttpStatus(500, "Webhook handler failed");
  }
});

// ─── Billing plans / checkout / portal ─────────────────────────────────────

router.get("/billing/plans", (_req: Request, res: Response) => {
  const stripeConfigured = stripeAvailable();
  // Match checkout's platform admission gates without exposing operational
  // blockers, provider configuration, or tenant-specific eligibility publicly.
  // Clients must also check the selected plan and interval's catalog flags.
  const checkoutAvailable = stripeConfigured && selfServeBillingEnabled() && !isLaunchHardBlocked();
  const usageTiers = PUBLIC_USAGE_TIERS.filter((tier) =>
    usageCheckoutConfigured(process.env, tier),
  );
  const usageCheckoutAvailable = checkoutAvailable && usageTiers.length > 0;
  // Local `npm run dev` sets this so /pricing can show the public cards without
  // Stripe price ids. Production, Preview, and the billing contract tests never
  // set it, and a production Vercel/Render env cannot turn it on.
  const devPlanPreview =
    process.env.DEV_BILLING_PLAN_PREVIEW === "true" &&
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL_ENV !== "production" &&
    !usageCheckoutAvailable;
  res.setHeader("Cache-Control", "no-store");
  res.json({
    plans: plansForClient({ usageCheckoutAvailable }),
    stripe_configured: stripeConfigured,
    checkout_available: checkoutAvailable,
    // Usage billing ships dark: "plans" until USAGE_BILLING_ENABLED is true.
    billing_model: usageBillingEnabled() ? "usage" : "plans",
    usage_checkout_available: usageCheckoutAvailable,
    usage_tiers: usageCheckoutAvailable
      ? usageTiers
      : devPlanPreview
        ? [...PUBLIC_USAGE_TIERS]
        : [],
  });
});

// ─── Usage billing: monthly spending limit ─────────────────────────────────

router.get(
  "/billing/usage-spend",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    res.setHeader("Cache-Control", "no-store");
    const { accountUsageSpendState } = await import("../lib/usage-billing-store");
    const state = await accountUsageSpendState(req.user!.id);
    if (!state) {
      res.json({ enabled: usageBillingEnabled(), usage_account: false });
      return;
    }
    res.json({
      enabled: true,
      usage_account: true,
      tier: state.tier,
      included_work_usd: state.includedWorkUsd,
      period: state.periodKey,
      spent_usd: state.spentUsd,
      cap_usd: state.capUsd,
      pct: state.pct,
      at_cap: state.atCap,
      headroom_usd: state.headroomUsd,
      reconciliation_required: state.reconciliationRequired,
      included_remaining_usd: state.includedRemainingUsd,
      work_usd: state.workUsd,
      max_cap_usd: USAGE_MAX_MONTHLY_CAP_USD,
    });
  },
);

router.put(
  "/billing/usage-spend",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    const raw = (req.body as { monthly_cap_usd?: unknown } | undefined)?.monthly_cap_usd;
    const capUsd = typeof raw === "number" ? raw : Number.NaN;
    if (!Number.isFinite(capUsd)) {
      throw AppError.badRequest("monthly_cap_usd must be a number.");
    }
    const { isUsageBillingAccount, setUsageMonthlyCap, accountUsageSpendState } =
      await import("../lib/usage-billing-store");
    if (!(await isUsageBillingAccount(req.user!.id))) {
      throw AppError.badRequest("This workspace is not on usage billing.");
    }
    await setUsageMonthlyCap(req.user!.id, Math.round(capUsd * 100) / 100);
    log.info("Usage monthly limit updated", {
      userId: req.user!.id,
      monthlyCapUsd: Math.round(capUsd * 100) / 100,
    });
    const state = await accountUsageSpendState(req.user!.id);
    res.json({
      ok: true,
      cap_usd: state?.capUsd ?? capUsd,
      at_cap: state?.atCap ?? false,
      spent_usd: state?.spentUsd,
      pct: state?.pct,
      headroom_usd: state?.headroomUsd,
    });
  },
);

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
   * Allowance through the shared strict resolver.
   *
   * Only `charge.refunded` may, and only as a fallback: the strict preflight
   * (stripe-runtime-allowance-retry.ts) owns non-top-up refunds and consumes
   * those events before this router sees them, keying every reversal on
   * refund.id. The fallback uses that same posted-grant and refund-id logic,
   * so even an alternate mount cannot debit from a mutable subscription.
   */
  allowSubscriptionFallback = true,
): Promise<void> {
  const expectation =
    event.type === "charge.refunded"
      ? { expectedCharge: event.data.object as Stripe.Charge }
      : { expectedRefund: event.data.object as Stripe.Refund };
  const fundingReconciled = await reconcilePaidAllowanceFundingForCharge({
    stripe,
    chargeId: charge.id,
    providerEventId: event.id,
    ...expectation,
  });
  if (fundingReconciled) return;
  const topUpReconciled = await reconcileStripeTopUpRefunds({
    stripe,
    chargeId: charge.id,
    providerEventId: event.id,
    ...expectation,
  });
  if (!topUpReconciled) {
    // Not a top-up — but a subscription invoice charge funds the Runtime
    // Allowance, which was granted on subscription sync and never came
    // back on a refund. Reverse it under the refund's own id.
    if (!allowSubscriptionFallback) {
      await listSucceededRefunds(charge.id, { charge, expectation });
      return;
    }
    await reverseSubscriptionRuntimeAllowanceForChargeStrict(
      charge,
      "refund",
      undefined,
      undefined,
      event.id,
      expectation,
    );
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
      const agentEntitlement = resolveAgentEntitlement({
        isOwner: isOwnerEmail(req.user.email),
        subscriptionStatus: sub?.status ?? settingsRow?.status,
        planId: sub?.plan,
        maxAgents: settingsRow?.maxAgents,
        extraAgents: settingsRow?.extraAgents,
      });

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
      let emailVerified: boolean | null = null;
      try {
        const [u] = await drizzle
          .select({ verifiedAt: schema.users.emailVerifiedAt })
          .from(schema.users)
          .where(eq(schema.users.id, req.user.id))
          .limit(1);
        emailVerified = !!u?.verifiedAt;
      } catch {
        // A lookup failure is not proof of verification. Clients retain the
        // last confirmed state and can retry without claiming success.
        emailVerified = null;
      }

      let channelEntitlements = null;
      try {
        const channels = await getTenantChannelEntitlements(req.user.id);
        channelEntitlements = {
          plan_id: channels.planId,
          subscription_status: channels.subscriptionStatus,
          channels: channels.channels,
          is_owner: channels.isOwner,
        };
      } catch {
        // An unavailable authoritative read must not look like zero purchased channels.
        channelEntitlements = null;
      }
      res.json({
        stripe_configured: stripeAvailable(),
        agent_count: agentCount ?? 0,
        channel_entitlements: channelEntitlements,
        phone_lines_used: phoneLineCount ?? 0,
        phone_lines_included: entitlementSlots,
        email_verified: emailVerified,
        subscription: sub
          ? {
              plan: sub.plan,
              plan_id: sub.plan,
              plan_name: planMeta?.name || null,
              max_agents: agentEntitlement.effectiveCap,
              extra_agents: agentEntitlement.purchasedExtras,
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
      throw AppError.fromHttpStatus(503, "Billing is temporarily unavailable.");
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
      if (!stripeAvailable()) {
        throw AppError.fromHttpStatus(503, "Billing is temporarily unavailable.");
      }
      if (!isLiveVideoCatalogReady()) {
        return res.status(503).json({
          code: "LIVE_VIDEO_CATALOG_UNAVAILABLE",
          error:
            "Live talking-head video is retired. Identity badges stay. Phone, email, and text are unaffected.",
        });
      }
      // The catalog is currently retired, but keep this dormant checkout path
      // safe if it is ever re-enabled: demo/test workspaces must never create a
      // Stripe customer or subscription with the deployment's live key.
      await assertLiveExternalActionAllowed(req.user.id, "live_video_checkout");
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
          error: "Activate a paid BotBound plan before adding live video.",
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
            error: "Checkout is being prepared. Retry to resume it safely.",
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
            warning: "Checkout is ready; BotBound is reconciling its local billing record.",
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
            error: "Checkout did not return a definitive result. Retry to resume safely.",
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
        plan_name: plan?.name || "Free Builder",
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
