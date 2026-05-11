import express from "express";
import Stripe from "stripe";
import { 
  db, 
  log, 
  auditLogger 
} from "../lib/server-context";
import { 
  stripe, 
  stripeAvailable, 
  syncSubscriptionFromStripe 
} from "../lib/stripe-helpers";
import { getErrorMessage } from "../lib/server-utils";

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

export default router;
