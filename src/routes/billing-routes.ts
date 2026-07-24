import { AppError } from "../lib/api-error";
/* eslint-disable @typescript-eslint/no-explicit-any -- Stripe events and subscription payloads are vendor-defined JSON. */
import express, { Request, Response } from "express";
import { drizzle, log, tenantStore, auditLogger } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, count } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { requirePlatformAdmin } from "../middleware/platform-admin";
import { getErrorMessage } from "../lib/server-utils";
import { stripe, stripeAvailable, syncSubscriptionFromStripe } from "../lib/stripe-helpers";
import { sendPaymentFailedEmail } from "../lib/email-service";
import { planById, plansForClient, FOUNDER_CATALOG_VERSION } from "../lib/plan-catalog";
import { getIncludedPhoneLineSlots } from "../lib/phone-line-entitlements";
import { getWorkspaceUsageSnapshot } from "../lib/workspace-usage-snapshot";
import { addCredit, reverseCredit } from "../lib/credit-wallet";
import Stripe from "stripe";
import type { AuthenticatedRequest } from "../types/auth";
import { resolveCanonicalAppUrl } from "../lib/app-url";
import { enforceLaunchHardGate } from "../middleware/launch-hard-gate";
import { emitServerProductEventOnce } from "../lib/product-event-server";
import { isLiveVideoCatalogReady } from "../lib/video-presenter/live-video-entitlements";

const router = express.Router();

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
  let claimed = false;
  try {
    await drizzle
      .insert(schema.stripeEvents)
      .values({ eventId: idempotencyKey, eventType: event.type });

    claimed = true;
  } catch (err: any) {
    if (err.code === "23505" || /duplicate key/i.test(err.message)) {
      log.info("Stripe webhook duplicate event ignored", {
        eventId: idempotencyKey,
        eventType: event.type,
      });
      return res.json({ received: true, duplicate: true });
    }
    log.warn("Stripe idempotency claim failed — refusing to process event", {
      error: getErrorMessage(err),
      eventId: idempotencyKey,
      eventType: event.type,
    });
    throw AppError.fromHttpStatus(503, "Webhook idempotency store unavailable. Retry later.");
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          if (session.metadata?.purpose === "live_video_addon") {
            const userId = session.metadata.wireline_user_id;
            if (userId) {
              await drizzle
                .update(schema.settings)
                .set({ liveVideoAddonEnabled: true, updatedAt: new Date() })
                .where(eq(schema.settings.userId, userId));
            }
            // The live-video add-on is a standalone subscription that shares the
            // customer with the plan subscription. Syncing it here would upsert
            // the single user-keyed plan row to plan=null and reset maxAgents to
            // 1 — silently downgrading a paying Pro/Business customer. Skip sync,
            // mirroring the guard in the customer.subscription.* handler below.
            break;
          }
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscriptionFromStripe(sub);
        } else if (
          session.mode === "payment" &&
          session.payment_status === "paid" &&
          session.metadata?.purpose === "credit_topup"
        ) {
          // Apple-safe wallet top-up: credit is purchased on the web, never
          // in-app. Idempotent twice over — the event is deduped via
          // wireline_stripe_events, and addCredit dedupes on the session id.
          const userId = session.metadata.wireline_user_id;
          const creditUsd = Number(session.metadata.credit_usd);
          if (userId && Number.isFinite(creditUsd) && creditUsd > 0) {
            await tenantStore.run(userId, async () => {
              await addCredit(userId, creditUsd, "web_topup", {
                type: "stripe_session",
                id: session.id,
                entryKind: "top_up",
                source: "stripe",
                provider: "stripe",
                providerEventId: event.id,
                providerObjectId: session.id,
                customerReason: "Conversation Balance top-up",
                metadata: {
                  checkout_session_id: session.id,
                  payment_intent:
                    typeof session.payment_intent === "string"
                      ? session.payment_intent
                      : session.payment_intent?.id,
                },
              });
            });
          } else {
            log.warn("credit_topup session missing user id or amount", {
              sessionId: session.id,
            });
          }
        }
        break;
      }
      case "charge.refunded": {
        // Claw back a refunded/disputed web credit top-up so a refund can't
        // leave the purchased credit sitting in the wallet. Only top-ups carry
        // purpose=credit_topup on their PaymentIntent. Idempotent via the
        // stripe_events guard above + the (user, ref) ledger index.
        const charge = event.data.object as Stripe.Charge;
        const piId =
          typeof charge.payment_intent === "string"
            ? charge.payment_intent
            : charge.payment_intent?.id;
        if (!piId) break;
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
                await reverseCredit(userId, (refund.amount ?? 0) / 100, "web_topup_refund", {
                  type: "stripe_refund",
                  id: refund.id,
                  entryKind: "refund",
                  source: "stripe",
                  provider: "stripe",
                  providerEventId: event.id,
                  providerObjectId: refund.id,
                  customerReason: "Conversation Balance refund",
                  metadata: { payment_intent_id: piId, charge_id: charge.id },
                });
              }
            });
          } else if (userId && (charge.amount_refunded ?? 0) > 0) {
            // The event omitted the inline refunds list (the pinned API version
            // no longer expands charge.refunds by default). Fetch them so each
            // partial refund is reversed once, keyed on its OWN id — reversing
            // the cumulative amount_refunded under charge.id would collide on
            // the (user, ref) unique index and silently drop every partial
            // refund after the first, leaving refunded money spendable.
            const listed = await stripe.refunds
              .list({ charge: charge.id, limit: 100 })
              .then((r) =>
                r.data.filter(
                  (x) => (!x.status || x.status === "succeeded") && (x.amount ?? 0) > 0,
                ),
              )
              .catch(() => [] as Stripe.Refund[]);
            await tenantStore.run(userId, async () => {
              if (listed.length) {
                for (const refund of listed) {
                  await reverseCredit(userId, (refund.amount ?? 0) / 100, "web_topup_refund", {
                    type: "stripe_refund",
                    id: refund.id,
                    entryKind: "refund",
                    source: "stripe",
                    provider: "stripe",
                    providerEventId: event.id,
                    providerObjectId: refund.id,
                    customerReason: "Conversation Balance refund",
                    metadata: { payment_intent_id: piId, charge_id: charge.id },
                  });
                }
              } else {
                // Last resort if the refund list is unexpectedly empty: reverse
                // the cumulative total keyed on charge.id (single-refund-safe).
                await reverseCredit(
                  userId,
                  (charge.amount_refunded ?? 0) / 100,
                  "web_topup_refund",
                  {
                    type: "stripe_refund",
                    id: charge.id,
                    entryKind: "refund",
                    source: "stripe",
                    provider: "stripe",
                    providerEventId: event.id,
                    providerObjectId: charge.id,
                    customerReason: "Conversation Balance refund",
                    metadata: { payment_intent_id: piId },
                  },
                );
              }
            });
          }
        }
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
          const disputedUsd = (dispute.amount ?? 0) / 100;
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
                customerReason: "Conversation Balance dispute reversal",
                metadata: { payment_intent_id: piId },
              });
            });
          }
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
            const disable =
              event.type === "customer.subscription.deleted" || terminal.has(sub.status);
            await drizzle
              .update(schema.settings)
              .set({ liveVideoAddonEnabled: !disable, updatedAt: new Date() })
              .where(eq(schema.settings.userId, userId));
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
                void sendPaymentFailedEmail({
                  to: userRow.email,
                  amountDisplay,
                  invoiceUrl: inv.hosted_invoice_url ?? undefined,
                  updateCardUrl: `${appUrl}/billing`,
                })
                  .then((r) => {
                    if (!r.ok)
                      log.warn("payment_failed dunning email not sent", {
                        userId: row.userId,
                        error: r.error,
                      });
                  })
                  .catch((err) =>
                    log.warn("payment_failed dunning email send threw", {
                      userId: row.userId,
                      error: getErrorMessage(err),
                    }),
                  );
              }
            }
          }
        } catch (err) {
          if (err instanceof AppError) throw err;
          log.error("invoice.payment_failed handler error", { error: getErrorMessage(err) });
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
        } catch {
          /* ignore */
        }
        break;
      }
      default:
        break;
    }
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
      const [subRows, agentCounts, phoneCounts, entitlementSlots] = await Promise.all([
        drizzle
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
          .limit(1),
        drizzle
          .select({ val: count() })
          .from(schema.agents)
          .where(eq(schema.agents.userId, req.user.id)),
        drizzle
          .select({ val: count() })
          .from(schema.phoneNumbers)
          .where(eq(schema.phoneNumbers.userId, req.user.id)),
        getIncludedPhoneLineSlots(req.user.id),
      ]);
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
              max_agents: planMeta?.max_agents || null,
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
          error: "Live video checkout is paused while the curated Presence Catalog is prepared.",
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
        const customer = await stripe.customers.create({
          email: req.user.email,
          metadata: { wireline_user_id: req.user.id },
        });
        customerId = customer.id;
        await drizzle
          .insert(schema.subscriptions)
          .values({ userId: req.user.id, stripeCustomerId: customerId, updatedAt: new Date() })
          .onConflictDoUpdate({
            target: schema.subscriptions.userId,
            set: { stripeCustomerId: customerId, updatedAt: new Date() },
          });
      }

      const appUrl = resolveCanonicalAppUrl();
      if ("error" in appUrl) {
        return res
          .status(503)
          .json({ error: "Billing is unavailable: APP_URL is not configured." });
      }
      const base = appUrl.url;
      const addonMeta = {
        wireline_user_id: req.user.id,
        purpose: "live_video_addon",
      };

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        automatic_tax: { enabled: true },
        customer_update: { address: "auto", name: "auto" },
        // Parity with the plan checkout — promo codes work on add-ons too.
        allow_promotion_codes: true,
        success_url: `${base}/settings/billing?live_video=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/settings/billing?live_video=canceled`,
        metadata: addonMeta,
        subscription_data: { metadata: addonMeta },
      });

      res.json({ url: session.url });
    } catch (e: any) {
      log.error("Live video checkout creation failed", { error: getErrorMessage(e) });
      throw AppError.fromHttpStatus(500, "Live video checkout failed");
    }
  },
);

/**
 * Per-agent overage purchase — GET reports current count + per-tier price,
 * POST adjusts the count up or down. Adjusts the Stripe subscription item
 * quantity in lockstep with the DB column.
 *
 * Account Holder flow:
 *   1. Pricing page promises "add extra agents at $X/each"
 *   2. Admin → Billing surfaces the current count + price + add/remove buttons
 *   3. Posting here updates `extra_agents` column + Stripe subscription item
 *   4. Agent deploy gate reads (plan.max_agents + extra_agents) as the cap
 *
 * Required env setup (per tier): STRIPE_<TIER>_EXTRA_AGENT_PRICE_ID set
 * to a Price ID with recurring.usage_type = "licensed" and amount equal
 * to extra_agent_price_usd × 100 cents. Without it, the endpoint returns
 * a clear "extra-agent billing not configured for your tier" error.
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

router.post(
  "/billing/extra-agents",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const raw = req.body?.count;
      const target = Number(raw);
      if (!Number.isInteger(target) || target < 0 || target > 100) {
        throw AppError.fromHttpStatus(400, "count must be an integer 0-100");
      }

      // Look up the tenant's current settings + subscription.
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
      if (!plan) throw AppError.fromHttpStatus(400, "Plan not found");

      const priceIdEnv = plan.extraAgentPriceIdEnv;
      const configuredPriceId = priceIdEnv ? process.env[priceIdEnv] : undefined;
      if (!priceIdEnv || !configuredPriceId) {
        return res.status(503).json({
          code: "SERVICE_UNAVAILABLE",
          error: `Extra-agent billing not configured for the ${plan.name} tier. Owner needs to set ${priceIdEnv || "STRIPE_<TIER>_EXTRA_AGENT_PRICE_ID"} in environment variables and link it to a Stripe Price.`,
        });
      }
      // Validate the env-configured price against the current founder catalog
      // so a stale env var can never silently charge a retired price. Only
      // enforced when Stripe is reachable — the local dev path below tolerates
      // an unconfigured Stripe client.
      const priceId = stripeAvailable()
        ? await validateFounderCatalogPriceId(configuredPriceId)
        : configuredPriceId;
      if (!priceId) {
        return res.status(503).json({
          code: "SERVICE_UNAVAILABLE",
          error: `Extra-agent price for ${plan.name} is not in the current founder catalog. Run stripe:setup and update ${priceIdEnv} in Vercel.`,
        });
      }

      // If Stripe is configured, adjust the subscription item quantity
      // to match. If not configured (dev), just persist the DB column.
      if (stripeAvailable()) {
        const [subRow] = await drizzle
          .select({ stripe_subscription_id: schema.subscriptions.stripeSubscriptionId })
          .from(schema.subscriptions)
          .where(eq(schema.subscriptions.userId, req.user!.id))
          .limit(1);
        const subscriptionId = subRow?.stripe_subscription_id;
        if (target > 0 && !subscriptionId) {
          return res.status(400).json({
            code: "BAD_REQUEST",
            error:
              "No active subscription found. Upgrade to a paid plan first to purchase extra agents.",
          });
        }
        if (subscriptionId) {
          try {
            // Find existing extra-agent line item (if any).
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            const existing = sub.items.data.find((i) => i.price?.id === priceId);
            if (existing) {
              if (target === 0) {
                await stripe.subscriptionItems.del(existing.id);
              } else {
                await stripe.subscriptionItems.update(existing.id, { quantity: target });
              }
            } else if (target > 0) {
              await stripe.subscriptionItems.create({
                subscription: subscriptionId,
                price: priceId,
                quantity: target,
              });
            }
          } catch (e) {
            if (e instanceof AppError) throw e;
            log.error("Stripe subscription item adjust failed", {
              error: getErrorMessage(e),
              userId: req.user!.id,
            });
            return res.status(502).json({
              code: "BAD_GATEWAY",
              error: "Couldn't update Stripe subscription. Try again or contact support.",
            });
          }
        }
      }

      // Persist the DB column.
      await drizzle
        .update(schema.settings)
        .set({ extraAgents: target })
        .where(eq(schema.settings.userId, req.user!.id));

      // Audit log so the change is queryable later. Uses
      // subscription_updated as the closest existing event type since
      // this is technically a subscription-item quantity change.
      void auditLogger
        .logBilling("subscription_updated", {
          userId: req.user!.id,
          metadata: { reason: "extra_agents_changed", target, plan_id: plan.id },
        })
        .catch((err) =>
          log.warn("billing audit log failed", {
            event: "subscription_updated",
            error: getErrorMessage(err),
          }),
        );

      res.json({
        ok: true,
        extra_agents: target,
        agents_total: (plan.max_agents || 1) + target,
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      log.error("/billing/extra-agents POST failed", { error: getErrorMessage(err) });
      throw AppError.fromHttpStatus(500, "Failed to update extra agents");
    }
  },
);

export default router;
