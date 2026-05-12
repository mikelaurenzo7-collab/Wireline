import express from "express";
import Stripe from "stripe";
import { 
  db, 
  log, 
  auditLogger 
} from "../lib/server-context";
import { stripe, stripeAvailable, syncSubscriptionFromStripe, planById, plansForClient } from "../lib/stripe-helpers";
import { getErrorMessage } from "../lib/server-utils";
import { authenticateUser } from "../middleware/auth";

const router = express.Router();

router.post("/api/stripe-webhook", async (req: any, res: any) => {
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
    const { error: claimErr } = await db
      .from("wireline_stripe_events")
      .insert({ event_id: idempotencyKey, event_type: event.type });
    if (claimErr) {
      log.info("Stripe webhook duplicate event ignored", {
        eventId: idempotencyKey,
        eventType: event.type,
        reason: claimErr.message,
      });
      return res.json({ received: true, duplicate: true });
    }
    claimed = true;
  } catch (err: any) {
    log.warn("Stripe idempotency claim failed — proceeding without idempotency guard", {
      error: getErrorMessage(err),
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === "subscription" && session.subscription) {
          const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          const sub = await stripe.subscriptions.retrieve(subId);
          await syncSubscriptionFromStripe(sub);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        if (event.type === "customer.subscription.created") (sub as any)._auditCreate = true;
        await syncSubscriptionFromStripe(sub);
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        log.warn("Stripe invoice payment failed", { customerId: inv.customer });
        try {
          const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
          if (customerId) {
            const { data: row } = await db.from("wireline_subscriptions")
              .select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
            if (row?.user_id) {
              void auditLogger.logBilling('payment_failed', {
                userId: row.user_id,
                customerId,
                amountCents: typeof inv.amount_due === "number" ? inv.amount_due : undefined,
                metadata: { invoice_id: inv.id, attempt_count: inv.attempt_count },
              }).catch(() => {});
            }
          }
        } catch { /* ignore */ }
        break;
      }
      case "invoice.payment_succeeded": {
        const inv = event.data.object as Stripe.Invoice;
        try {
          const customerId = typeof inv.customer === "string" ? inv.customer : inv.customer?.id;
          if (customerId) {
            const { data: row } = await db.from("wireline_subscriptions")
              .select("user_id").eq("stripe_customer_id", customerId).maybeSingle();
            if (row?.user_id) {
              void auditLogger.logBilling('payment_succeeded', {
                userId: row.user_id,
                customerId,
                amountCents: typeof inv.amount_paid === "number" ? inv.amount_paid : undefined,
                metadata: { invoice_id: inv.id },
              }).catch(() => {});
            }
          }
        } catch { /* ignore */ }
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
        await db.from("wireline_stripe_events").delete().eq("event_id", idempotencyKey);
      } catch { /* best-effort rollback */ }
    }
    res.status(500).json({ error: "Webhook handler failed" });
  }
});

function billingBaseUrl(req: any): string {
  // Honor APP_URL when set (production). Otherwise fall back to the
  // Origin header so dev sandboxes work without env config.
  return (process.env.APP_URL || req.get("origin") || "http://localhost:3000").replace(/\/+$/, "");
}

// Public — anyone can read the catalog (renders pre-auth on the
// pricing surface in the future). No secrets are exposed.
router.get("/api/billing/plans", (_req: any, res: any) => {
  res.json({ plans: plansForClient(), stripe_configured: stripeAvailable() });
});

// Operator-facing read of their current sub.
router.get("/api/billing/status", authenticateUser, async (req: any, res: any) => {
  try {
    const [{ data: sub }, { count: agentCount }] = await Promise.all([
      db.from("wireline_subscriptions")
        .select("plan, status, current_period_end, cancel_at_period_end, stripe_customer_id, stripe_subscription_id, updated_at")
        .eq("user_id", req.user.id).maybeSingle(),
      db.from("wireline_agents").select("id", { count: "exact", head: true }).eq("user_id", req.user.id),
    ]);
    const planMeta = sub?.plan ? planById(sub.plan) : null;
    res.json({
      stripe_configured: stripeAvailable(),
      agent_count: agentCount ?? 0,
      subscription: sub ? {
        plan: sub.plan,
        plan_name: planMeta?.name || null,
        max_agents: planMeta?.max_agents || null,
        status: sub.status,
        current_period_end: sub.current_period_end,
        cancel_at_period_end: !!sub.cancel_at_period_end,
        has_customer: !!sub.stripe_customer_id,
        has_subscription: !!sub.stripe_subscription_id,
        updated_at: sub.updated_at,
      } : null,
    });
  } catch (e: any) { log.error("Failed to load status", { error: getErrorMessage(e) }); res.status(500).json({ error: "Failed to load status" }); }
});

// Start a Stripe Checkout session for a plan. Idempotent on
// stripe_customer_id — we re-use the customer across upgrades so
// invoices and payment methods carry forward.
router.post("/api/billing/checkout", authenticateUser, async (req: any, res: any) => {
  try {
    if (!stripeAvailable()) return res.status(503).json({ error: "Stripe not configured." });
    const planId = String(req.body?.plan_id || "").trim();
    const plan = planById(planId);
    if (!plan) return res.status(400).json({ error: "Unknown plan_id." });
    const priceId = process.env[plan.priceIdEnv];
    if (!priceId) return res.status(503).json({ error: `Price for plan '${plan.id}' not configured (${plan.priceIdEnv}).` });

    // Find the existing Stripe row first — we need to gate against
    // double-subscribing AND we'll re-use the customer if present.
    const { data: existing } = await db.from("wireline_subscriptions")
      .select("stripe_customer_id, stripe_subscription_id, status, plan")
      .eq("user_id", req.user.id).maybeSingle();

    // Block creating a second concurrent subscription. Stripe permits
    // multiple subs per customer unless we explicitly prevent it; our
    // wireline_subscriptions row only tracks ONE stripe_subscription_id
    // so a second checkout would silently double-charge the operator
    // and leave the second sub orphaned in Stripe. Plan changes go
    // through the Customer Portal (clean proration, single sub) — the
    // UI redirects there when an active sub already exists.
    const liveStatuses = new Set(["active", "trialing", "past_due", "incomplete", "unpaid"]);
    if (existing?.stripe_subscription_id && liveStatuses.has(existing.status || "")) {
      return res.status(409).json({
        error:
          "You already have an active subscription. Use the Customer Portal to change plans " +
          "(this avoids creating a second concurrent subscription).",
        code: "ALREADY_SUBSCRIBED",
        current_plan: existing.plan,
        current_status: existing.status,
      });
    }

    // Find or create the Stripe Customer for this user.
    let customerId = existing?.stripe_customer_id || null;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { wireline_user_id: req.user.id },
      });
      customerId = customer.id;
      await db.from("wireline_subscriptions").upsert({
        user_id: req.user.id,
        stripe_customer_id: customerId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
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
    void auditLogger.logBilling('checkout_started', {
      userId: req.user.id, plan: plan.id, customerId, ip: req.ip,
    }).catch(() => {});
  } catch (e: any) {
    log.error("Checkout creation failed", { error: e?.message || String(e) });
    res.status(500).json({ error: "Checkout failed" });
  }
});

// Open the Stripe Customer Portal for the operator to manage their
// subscription, payment method, invoice history, and cancellation.
router.post("/api/billing/portal", authenticateUser, async (req: any, res: any) => {
  try {
    if (!stripeAvailable()) return res.status(503).json({ error: "Stripe not configured." });
    const { data: sub } = await db.from("wireline_subscriptions")
      .select("stripe_customer_id").eq("user_id", req.user.id).maybeSingle();
    if (!sub?.stripe_customer_id) {
      return res.status(404).json({ error: "No Stripe customer for this user yet — run checkout first." });
    }
    const base = billingBaseUrl(req);
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${base}/admin`,
    });
    res.json({ url: portal.url });
    void auditLogger.logBilling('portal_opened', {
      userId: req.user.id, customerId: sub.stripe_customer_id, ip: req.ip,
    }).catch(() => {});
  } catch (e: any) {
    log.error("Portal session failed", { error: e?.message || String(e) });
    res.status(500).json({ error: "Portal failed" });
  }
});

export default router;
