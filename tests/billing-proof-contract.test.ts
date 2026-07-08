import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { isBalanceFundedVoicePlan } from "../src/lib/voice-billing-policy";

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
    expect(stripeHelpers).toContain("maxAgents: plan?.max_agents");
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

  it("blocks insufficient live pay-as-you-go voice work with a clear recovery path", () => {
    const guard = read("src/lib/voice-wallet-guard.ts");
    const spendControl = read("src/lib/voice-spend-control.ts");

    expect(guard).toContain('code: "INSUFFICIENT_BALANCE"');
    expect(guard).toContain('recovery_path: "/settings/billing"');
    expect(guard).toContain("required_usd");
    expect(spendControl).toContain("assertVoiceWalletSolvent");
  });

  it("treats Personal voice usage as balance-funded even when a subscription row exists", () => {
    const usage = read("src/lib/voice-usage.ts");
    const guard = read("src/lib/voice-wallet-guard.ts");

    expect(isBalanceFundedVoicePlan(null)).toBe(true);
    expect(isBalanceFundedVoicePlan("personal")).toBe(true);
    expect(isBalanceFundedVoicePlan("team")).toBe(false);
    expect(isBalanceFundedVoicePlan("business")).toBe(false);
    expect(usage).toContain("isBalanceFundedVoicePlan(planId)");
    expect(guard).toContain("isBalanceFundedVoicePlan(planId)");
    expect(usage).toContain(
      "They do not receive the historical included-minute compatibility allowance.",
    );
  });

  it("reconciles usage events against plan, balance, and Stripe meter state", () => {
    const usage = read("src/lib/voice-usage.ts");
    const stripeHelpers = read("src/lib/stripe-helpers.ts");

    expect(usage).toContain("Math.ceil(durationSeconds / 60)");
    expect(usage).toContain("schema.quotaUsage");
    expect(usage).toContain('planById(planId ?? "personal")');
    expect(usage).toContain("debitForVoiceUsage(userId, overageCostUsd, vapiCallId)");
    expect(usage).toContain("debitForOverage(userId, overageCostUsd, vapiCallId)");
    expect(usage).toContain("emitVoiceMinuteOverageEvent");
    expect(stripeHelpers).toContain("identifier: `voice_overage_${opts.vapiCallId}`");
  });

  it("links the canonical billing runbook from the docs index", () => {
    expect(read("docs/BILLING_RUNBOOK.md")).toContain("Status: **Active canonical runbook**");
    expect(read("docs/README.md")).toContain("[BILLING_RUNBOOK.md](./BILLING_RUNBOOK.md)");
  });
});
