import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("billing proof contract", () => {
  it("keeps checkout reachable for new users while blocking retired/contact-sales plans clearly", () => {
    const billingRoutes = read("src/routes/billing-routes.ts");
    const checkoutGuard = read("src/routes/subscription-checkout-guard-routes.ts");
    const billingCard = read("src/components/StripeBillingCard.tsx");

    expect(billingRoutes).toContain('router.post(\n  "/billing/checkout"');
    expect(billingRoutes).toContain('code: "CONTACT_SALES_PLAN"');
    expect(billingRoutes).toContain('code: "ALREADY_SUBSCRIBED"');
    expect(billingRoutes).toContain("subscriptionCheckoutLineItems(plan, interval)");
    expect(checkoutGuard).toContain('code: "LEGACY_PLAN_RETIRED"');
    expect(billingCard).toContain('authFetch("/api/billing/checkout"');
  });

  it("syncs successful checkout and subscription webhooks into server-owned entitlements", () => {
    const billingRoutes = read("src/routes/billing-routes.ts");
    const stripeHelpers = read("src/lib/stripe-helpers.ts");

    expect(billingRoutes).toContain('case "checkout.session.completed"');
    expect(billingRoutes).toContain("await syncSubscriptionFromStripe(sub)");
    expect(stripeHelpers).toContain("export async function syncSubscriptionFromStripe");
    expect(stripeHelpers).toContain("schema.subscriptions");
    expect(stripeHelpers).toContain("schema.settings");
    expect(stripeHelpers).toContain("const baseMaxAgents = plan?.max_agents ?? 1");
    expect(stripeHelpers).toContain("maxAgents: effectiveMaxAgents");
    expect(stripeHelpers).toContain("subscriptionStatus: localStatus");
  });

  it("claims webhook event ids before side effects and preserves wallet idempotency", () => {
    const billingRoutes = read("src/routes/billing-routes.ts");
    const wallet = read("src/lib/credit-wallet.ts");

    expect(billingRoutes).toContain("schema.stripeEvents");
    expect(billingRoutes).toContain("duplicate: true");
    expect(billingRoutes).toContain("Webhook idempotency store unavailable. Retry later.");
    expect(wallet).toContain("onConflictDoNothing()");
    expect(wallet).toContain("idempotencyKey: ref?.idempotencyKey");
  });

  it("surfaces cancellation and downgrade state from Stripe in the app", () => {
    const billingRoutes = read("src/routes/billing-routes.ts");
    const stripeHelpers = read("src/lib/stripe-helpers.ts");
    const billingCard = read("src/components/StripeBillingCard.tsx");

    expect(billingRoutes).toContain('case "customer.subscription.updated"');
    expect(billingRoutes).toContain('case "customer.subscription.deleted"');
    expect(stripeHelpers).toContain("cancelAtPeriodEnd: !!sub.cancel_at_period_end");
    expect(stripeHelpers).toContain('stripeStatus === "past_due" || stripeStatus === "unpaid"');
    expect(billingCard).toContain("cancel_at_period_end");
    expect(billingCard).toContain("Cancels at period end");
  });

  it("keeps Conversation Balance top-up metadata and refund/dispute recovery wired", () => {
    const balanceRoutes = read("src/routes/conversation-balance-routes.ts");
    const billingRoutes = read("src/routes/billing-routes.ts");

    expect(balanceRoutes).toContain('purpose: "credit_topup"');
    expect(balanceRoutes).toContain("payment_intent_data: { metadata: creditMeta }");
    expect(balanceRoutes).toContain("metadata: creditMeta");
    expect(billingRoutes).toContain("await addCredit(userId, creditUsd");
    expect(billingRoutes).toContain('case "charge.refunded"');
    expect(billingRoutes).toContain('case "charge.dispute.created"');
    expect(billingRoutes).toContain("await reverseCredit(userId");
  });

  it("blocks depleted live voice coverage with a clear recovery path", () => {
    const guard = read("src/lib/voice-wallet-guard.ts");
    const spendControl = read("src/lib/voice-spend-control.ts");

    expect(guard).toContain('code: "VOICE_COVERAGE_DEPLETED"');
    expect(guard).toContain('recovery_path: "/settings/billing"');
    expect(guard).toContain("required_usd");
    expect(spendControl).toContain("assertVoiceWalletSolvent");
  });

  it("keeps Personal locked out of live voice with zero included minutes", () => {
    const catalog = read("src/lib/plan-catalog.ts");
    const guard = read("src/lib/voice-wallet-guard.ts");

    expect(catalog).toContain('id: "personal"');
    expect(guard).toContain('planId !== "personal"');
    expect(guard).toContain('code: "LIVE_PLAN_REQUIRED"');
  });

  it("keeps free activation, prepaid balance, and past-due recovery commercially consistent", () => {
    const modal = read("src/components/TrialGateModal.tsx");
    const billingCard = read("src/components/StripeBillingCard.tsx");
    const balanceRoutes = read("src/routes/conversation-balance-routes.ts");
    const billingRoutes = read("src/routes/billing-routes.ts");

    expect(balanceRoutes).toContain('plan.id !== "personal"');
    expect(modal).not.toContain('authFetch("/api/conversation-balance/checkout"');
    expect(modal).toContain('authFetch("/api/billing/portal"');
    expect(modal).toContain('detail.code === "SUBSCRIPTION_REQUIRED"');
    expect(billingCard).toContain("{canAddBalance && <CreditTopUpCard");
    expect(billingCard).not.toContain(
      'sub.status === "trialing" || sub.status === "past_due");\n    if (!hasPaidSubscription)',
    );
    expect(read("src/pages/BillingSettings.tsx")).toContain("const canAddBalance =");
    expect(billingCard).not.toContain("Personal activation without a subscription");
    expect(billingRoutes).not.toContain("credit top-up activates a pending account");
  });

  it("reconciles voice usage against plan, included minutes, and completion grace", () => {
    const usage = read("src/lib/voice-usage.ts");
    const grace = read("src/lib/voice-completion-grace.ts");

    expect(usage).toContain("Math.ceil(safeSeconds / 60)");
    expect(usage).toContain("schema.quotaUsage");
    expect(usage).toContain('planById(planId ?? "personal")');
    expect(usage).toContain("chargeCompletedVoiceUsage");
    expect(usage).toContain("No Stripe meter event is emitted");
    expect(grace).toContain("reverseCredit");
    expect(grace).toContain("idempotencyKey: `voice_completion:${opts.providerCallId}`");
  });

  it("grants a recurring Runtime Allowance credit when a paid subscription syncs", () => {
    const welcome = read("src/lib/subscription-welcome-credit.ts");
    const stripeHelpers = read("src/lib/stripe-helpers.ts");
    expect(welcome).toContain("runtime_allowance_usd_monthly");
    expect(welcome).toContain("subscription_runtime_allowance");
    expect(stripeHelpers).toContain(
      "grantSubscriptionRuntimeAllowance(userId, periodReference, plan.id, interval)",
    );
  });

  it("bills SMS segments from Conversation Balance via a prepaid reservation", () => {
    const sms = read("src/lib/sms-billing.ts");
    const twilio = read("src/lib/twilio-service.ts");
    expect(sms).toContain("SMS_COST_PER_SEGMENT_USD = 0.02");
    expect(sms).toContain("billSmsMessage");
    expect(twilio).toContain("reserveRuntimeUsage");
    expect(twilio).toContain("adjustMessagingReservation");
    expect(twilio).toContain("message.numSegments");
  });

  it("keeps the Runtime Allowance grant idempotent per billing period", () => {
    const welcome = read("src/lib/subscription-welcome-credit.ts");
    expect(welcome).toContain('entryKind: "grant"');
    expect(welcome).toContain("id: billingPeriodReference");
  });

  it("checks the canonical founder Stripe environment without reviving postpaid metering", () => {
    const envCheck = read("scripts/check-prod-env.mjs");
    const canonicalKeys = [
      "STRIPE_STARTER_9_PRICE_ID",
      "STRIPE_STARTER_9_ANNUAL_PRICE_ID",
      "STRIPE_STARTER_PRICE_ID",
      "STRIPE_STARTER_ANNUAL_PRICE_ID",
      "STRIPE_TEAM_PRICE_ID",
      "STRIPE_TEAM_ANNUAL_PRICE_ID",
      "STRIPE_BUSINESS_PRICE_ID",
      "STRIPE_BUSINESS_ANNUAL_PRICE_ID",
      "STRIPE_EXTRA_AGENT_PRICE_ID",
      "STRIPE_LIVE_VIDEO_ADDON_PRICE_ID",
    ];

    for (const key of canonicalKeys) expect(envCheck).toContain(`["${key}"`);
    expect(envCheck).not.toContain('["STRIPE_BUSINESS_STARTER_PRICE_ID"');
    expect(envCheck).not.toContain('["STRIPE_PRO_PRICE_ID"');
    expect(envCheck).not.toContain('["STRIPE_VOICE_OVERAGE_METER_EVENT_NAME"');
  });

  it("links the canonical billing runbook from the docs index", () => {
    expect(read("docs/BILLING_RUNBOOK.md")).toContain("Status: **Active canonical runbook**");
    expect(read("docs/README.md")).toContain("[BILLING_RUNBOOK.md](./BILLING_RUNBOOK.md)");
  });
});
