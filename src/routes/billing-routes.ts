import express, { Request, Response } from "express";
import { log, auditLogger, drizzle } from "../lib/server-context";
import * as schema from "../db/schema";
import { eq, and, sql, desc, count } from "drizzle-orm";
import { authenticateUser } from "../middleware/auth";
import { getErrorMessage } from "../lib/server-utils";
import { stripe, stripeAvailable, syncSubscriptionFromStripe } from "../lib/stripe-helpers";
import { clearBudgetCache, getBudgetSnapshot } from "../lib/spend-guards";
import { planById, plansForClient } from "../lib/plan-catalog";
import { getIncludedPhoneLineSlots } from "../lib/phone-line-entitlements";
import { getVoiceUsageSnapshot } from "../lib/voice-usage";
import Stripe from "stripe";
import type { AuthenticatedRequest } from "../types/auth";

const router = express.Router();
function billingBaseUrl(req: Request): string {
  return (process.env.APP_URL || req.get("origin") || "http://localhost:3000").replace(/\/+$/, "");
}

// ─── Stripe Webhook ──────────────────────────────────────────────────────────

router.post("/stripe-webhook", async (req: Request, res: Response) => {
  if (!stripeAvailable() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: "Stripe webhook not configured." });
  }
  const sig = req.headers["stripe-signature"] as string | undefined;
  if (!sig) return res.status(400).json({ error: "Missing stripe-signature header." });

  let event: Stripe.Event;
  try {
    // express.raw populated req.body as a Buffer
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    log.warn("Stripe webhook signature verification failed", { error: getErrorMessage(err) });
    return res.status(400).json({ error: "Webhook signature verification failed." });
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
    log.warn("Stripe idempotency claim failed — proceeding without idempotency guard", {
      error: getErrorMessage(err),
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscriptionFromStripe(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        if (event.type === "customer.subscription.created")
          (sub as unknown as Record<string, unknown>)._auditCreate = true;
        await syncSubscriptionFromStripe(sub);
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
                .catch(() => {});
            }
          }
        } catch {
          /* ignore */
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
                .catch(() => {});
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
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

// ─── Spend budget ──────────────────────────────────────────────────────────

router.put("/spend/budget", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Number(req.body.monthly_limit_usd ?? 0);
    const warn = Math.round(Number(req.body.warn_threshold_pct ?? 80));
    const hardCap = !!req.body.hard_cap;
    const enabled = req.body.enabled !== false;
    if (!Number.isFinite(limit) || limit < 0)
      return res.status(400).json({ error: "monthly_limit_usd must be a non-negative number" });
    if (!Number.isInteger(warn) || warn < 1 || warn > 99)
      return res.status(400).json({ error: "warn_threshold_pct must be 1–99" });

    const [data] = await drizzle
      .insert(schema.spendBudgets)
      .values({
        userId: req.user.id,
        monthlyLimitUsd: limit.toString(),
        hardCap,
        warnThresholdPct: warn,
        enabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.spendBudgets.userId,
        set: {
          monthlyLimitUsd: limit.toString(),
          hardCap,
          warnThresholdPct: warn,
          enabled,
          updatedAt: new Date(),
        },
      })
      .returning();

    clearBudgetCache(req.user.id);
    res.json({ budget: data });
  } catch (e: any) {
    log.error("Failed to save budget", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to save budget" });
  }
});

router.get("/spend/status", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snap = await getBudgetSnapshot(req.user.id, true);
    const alerts = await drizzle
      .select({
        thresholdPct: schema.spendAlerts.thresholdPct,
        firedAt: schema.spendAlerts.firedAt,
      })
      .from(schema.spendAlerts)
      .where(
        and(eq(schema.spendAlerts.userId, req.user.id), eq(schema.spendAlerts.period, snap.period)),
      )
      .orderBy(schema.spendAlerts.thresholdPct);

    const limit = snap.budget?.monthly_limit_usd ? Number(snap.budget.monthly_limit_usd) : 0;
    const pct = limit > 0 ? (snap.mtdCost / limit) * 100 : 0;
    res.json({
      period: snap.period,
      month_to_date_usd: Number(snap.mtdCost.toFixed(4)),
      monthly_limit_usd: limit,
      percent_used: Number(pct.toFixed(1)),
      hard_cap: snap.budget?.hard_cap ?? false,
      enabled: snap.budget?.enabled ?? true,
      warn_threshold_pct: snap.budget?.warn_threshold_pct ?? 80,
      hard_capped_now: !!(snap.budget?.hard_cap && limit > 0 && snap.mtdCost >= limit),
      alerts_fired: alerts || [],
    });
  } catch (e: any) {
    log.error("Failed to load spend status", { error: getErrorMessage(e) });
    res.status(500).json({ error: "Failed to load spend status" });
  }
});

// ─── Billing plans / checkout / portal ─────────────────────────────────────

router.get("/billing/plans", (_req: Request, res: Response) => {
  res.json({ plans: plansForClient(), stripe_configured: stripeAvailable() });
});

router.get("/billing/usage", authenticateUser, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = await getVoiceUsageSnapshot(req.user!.id);
    res.json(snapshot);
  } catch (err) {
    log.error("/billing/usage failed", { error: getErrorMessage(err) });
    res.status(500).json({ error: "Failed to load usage snapshot" });
  }
});

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
      res.json({
        stripe_configured: stripeAvailable(),
        agent_count: agentCount ?? 0,
        phone_lines_used: phoneLineCount ?? 0,
        phone_lines_included: entitlementSlots,
        subscription: sub
          ? {
              plan: sub.plan,
              plan_name: planMeta?.name || null,
              max_agents: planMeta?.max_agents || null,
              status: sub.status,
              current_period_end: sub.currentPeriodEnd,
              cancel_at_period_end: !!sub.cancelAtPeriodEnd,
              has_customer: !!sub.stripeCustomerId,
              has_subscription: !!sub.stripeSubscriptionId,
              updated_at: sub.updatedAt,
            }
          : null,
      });
    } catch (e: any) {
      log.error("Failed to load status", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Failed to load status" });
    }
  },
);

router.post(
  "/billing/checkout",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!stripeAvailable()) return res.status(503).json({ error: "Stripe not configured." });
      const planId = String(req.body?.plan_id || "").trim();
      const plan = planById(planId);
      if (!plan) return res.status(400).json({ error: "Unknown plan_id." });
      // Contact-sales tiers (price_usd_monthly === 0) must never go through
      // self-serve checkout — even if a stale STRIPE_*_PRICE_ID is configured
      // they'd subscribe at $0/mo against a real Stripe price.
      if (plan.price_usd_monthly === 0) {
        return res.status(400).json({
          error: `Plan '${plan.id}' is contact-sales only. Reach out at sales@wireline.app.`,
          code: "CONTACT_SALES_PLAN",
        });
      }
      const priceId = process.env[plan.priceIdEnv];
      if (!priceId)
        return res
          .status(503)
          .json({ error: `Price for plan '${plan.id}' not configured (${plan.priceIdEnv}).` });

      const [existing] = await drizzle
        .select({
          stripeCustomerId: schema.subscriptions.stripeCustomerId,
          stripeSubscriptionId: schema.subscriptions.stripeSubscriptionId,
          status: schema.subscriptions.status,
          plan: schema.subscriptions.plan,
        })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, req.user.id))
        .limit(1);

      const liveStatuses = new Set(["active", "trialing", "past_due", "incomplete", "unpaid"]);
      if (existing?.stripeSubscriptionId && liveStatuses.has(existing.status || "")) {
        return res.status(409).json({
          error:
            "You already have an active subscription. Use the Customer Portal to change plans " +
            "(this avoids creating a second concurrent subscription).",
          code: "ALREADY_SUBSCRIBED",
          current_plan: existing.plan,
          current_status: existing.status,
        });
      }

      let customerId = existing?.stripeCustomerId || null;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.user.email,
          metadata: { wireline_user_id: req.user.id },
        });
        customerId = customer.id;
        await drizzle
          .insert(schema.subscriptions)
          .values({
            userId: req.user.id,
            stripeCustomerId: customerId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: schema.subscriptions.userId,
            set: {
              stripeCustomerId: customerId,
              updatedAt: new Date(),
            },
          });
      }

      const base = billingBaseUrl(req);
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${base}/admin?billing=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/admin?billing=canceled`,
        allow_promotion_codes: true,
        subscription_data: {
          metadata: { wireline_user_id: req.user.id, wireline_plan: plan.id },
        },
      });
      res.json({ url: session.url });
      void auditLogger
        .logBilling("checkout_started", {
          userId: req.user.id,
          plan: plan.id,
          customerId,
          ip: req.ip,
        })
        .catch(() => {});
    } catch (e: any) {
      log.error("Checkout creation failed", { error: getErrorMessage(e) });
      res.status(500).json({ error: "Checkout failed" });
    }
  },
);

router.post(
  "/billing/portal",
  authenticateUser,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      if (!stripeAvailable()) return res.status(503).json({ error: "Stripe not configured." });
      const [sub] = await drizzle
        .select({ stripeCustomerId: schema.subscriptions.stripeCustomerId })
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.userId, req.user.id))
        .limit(1);

      if (!sub?.stripeCustomerId) {
        return res
          .status(404)
          .json({ error: "No Stripe customer for this user yet — run checkout first." });
      }
      const base = billingBaseUrl(req);
      const portal = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${base}/admin`,
      });
      res.json({ url: portal.url });
      void auditLogger
        .logBilling("portal_opened", {
          userId: req.user.id,
          customerId: sub.stripeCustomerId,
          ip: req.ip,
        })
        .catch(() => {});
    } catch (e: any) {
      // Stripe SDK errors carry rich diagnostic context that the old
      // `getErrorMessage(e)` collapsed to a single message string —
      // making it impossible to tell from prod logs whether the portal
      // is misconfigured (no default config saved in Stripe Dashboard),
      // the key is in the wrong mode (live key + test customer), the
      // customer was deleted in Stripe, or something else. Capture the
      // full Stripe error envelope so the next 500 actually points us
      // at the root cause. See https://stripe.com/docs/api/errors for
      // the field semantics.
      const stripeErr = {
        type: e?.type, // e.g. "StripeInvalidRequestError"
        code: e?.code, // e.g. "billing_portal_configuration_default_missing"
        statusCode: e?.statusCode,
        requestId: e?.requestId,
        param: e?.param,
        // The raw message from Stripe usually tells you exactly what to fix
        // in the Dashboard. Truncate aggressively in case Stripe ever
        // returns something verbose.
        rawMessage: typeof e?.raw?.message === "string" ? e.raw.message.slice(0, 500) : undefined,
        message: getErrorMessage(e),
      };
      log.error("Portal session failed", {
        stripeError: stripeErr,
        userId: req.user?.id,
      });

      // Surface a more specific client error for the well-known root
      // causes — the generic "Portal failed" leaves operators staring
      // at a 500 with no remediation path. Stripe documents these codes
      // verbatim, so matching on `code` is safe and durable.
      if (stripeErr.code === "billing_portal_configuration_default_missing") {
        return res.status(503).json({
          error:
            "Stripe Customer Portal is not configured. " +
            "An operator must save the default portal configuration in the Stripe Dashboard.",
          code: "PORTAL_NOT_CONFIGURED",
        });
      }
      if (stripeErr.type === "StripeAuthenticationError") {
        return res.status(503).json({
          error: "Stripe authentication failed — server key may be in the wrong mode.",
          code: "STRIPE_AUTH_ERROR",
        });
      }
      if (
        stripeErr.type === "StripeInvalidRequestError" &&
        (stripeErr.code === "resource_missing" || /No such customer/i.test(stripeErr.message))
      ) {
        // Customer existed in our DB but was deleted (or never existed)
        // in Stripe — likely a test/live mode mismatch on the customer
        // id. Fall back to a 404 so the UI can prompt re-checkout.
        return res.status(404).json({
          error:
            "Stripe customer record is missing — please re-run checkout to recreate your billing profile.",
          code: "STRIPE_CUSTOMER_MISSING",
        });
      }

      res.status(500).json({ error: "Portal failed" });
    }
  },
);

export default router;
