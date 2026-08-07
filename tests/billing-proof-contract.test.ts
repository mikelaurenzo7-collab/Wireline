import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("billing proof contract", () => {
  it("keeps a single founder-catalog checkout owner reachable for new users", () => {
    const registry = read("src/server/register-api-routes.ts");
    const launchCheckout = read("src/routes/launch-billing-checkout-routes.ts");
    const billingRoutes = read("src/routes/billing-routes.ts");
    const billingCard = read("src/components/StripeBillingCard.tsx");

    expect(registry).toContain("app.use(launchBillingCheckoutRouter)");
    expect(registry).not.toContain("subscriptionCheckoutGuardRouter");
    expect(launchCheckout).toContain('router.post(\n  "/api/billing/checkout"');
    expect(launchCheckout).toContain('code: "FREE_PLAN_NO_CHECKOUT"');
    expect(launchCheckout).toContain('code: "ALREADY_SUBSCRIBED"');
    expect(launchCheckout).toContain('code: "LEGACY_PLAN_RETIRED"');
    expect(launchCheckout).toContain("FOUNDER_CATALOG_VERSION");
    expect(launchCheckout).toContain(
      "success_url: `${appUrl.url}/settings/billing?billing=success",
    );
    expect(launchCheckout).toContain(
      "cancel_url: `${appUrl.url}/settings/billing?billing=canceled`",
    );
    expect(launchCheckout).not.toContain("/admin?billing=");
    expect(billingRoutes).not.toContain('router.post(\n  "/billing/checkout"');
    expect(billingRoutes).not.toContain("subscriptionCheckoutLineItems");
    expect(billingCard).toContain('authFetch("/api/billing/checkout"');
  });

  it("keeps a single managed Stripe portal owner returning to settings billing", () => {
    const registry = read("src/server/register-api-routes.ts");
    const portal = read("src/routes/billing-portal-readiness-routes.ts");
    const billingRoutes = read("src/routes/billing-routes.ts");

    expect(registry).toContain("app.use(billingPortalReadinessRouter)");
    expect(portal).toContain('router.post(\n  "/api/billing/portal"');
    expect(portal).toContain("ensureManagedPortalConfiguration");
    expect(portal).toContain("return_url: `${appUrl.url}/settings/billing`");
    expect(portal).not.toContain("return_url: `${appUrl.url}/admin`");
    expect(billingRoutes).not.toContain('router.post(\n  "/billing/portal"');
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

  it("ignores a stale terminal webhook for a superseded subscription", () => {
    // The mirror row is one-per-customer, so a delayed customer.subscription.deleted
    // for a subscription the customer already replaced (cancel-then-resubscribe on
    // the same Stripe customer) must not overwrite the new active row to canceled
    // and hard-block a paying customer. syncSubscriptionFromStripe carries an
    // identity guard keyed on the mirrored stripeSubscriptionId.
    const stripeHelpers = read("src/lib/stripe-helpers.ts");

    // Terminal statuses are enumerated explicitly. Deriving them by complement
    // of the live set silently classifies `incomplete` (SCA pending) and
    // `paused` as terminal and drops their events.
    expect(stripeHelpers).toMatch(
      /TERMINAL_SUBSCRIPTION_STATUSES = new Set<string>\(\[\s*"canceled",\s*"incomplete_expired",?\s*\]\)/,
    );
    expect(stripeHelpers).toContain("TERMINAL_SUBSCRIPTION_STATUSES.has(sub.status)");
    expect(stripeHelpers).toContain("existing.stripeSubscriptionId !== sub.id");

    // The guard must protect only a LIVE mirror, or one out-of-order event can
    // pin the row to a dead id and make every later cancellation a no-op.
    expect(stripeHelpers).toContain("mirrorIsLive");
    expect(stripeHelpers).toMatch(
      /!!existing\.status && !TERMINAL_SUBSCRIPTION_STATUSES\.has\(existing\.status\)/,
    );

    // The guard must actually skip the sync — asserting only the log would pass
    // with the body gutted.
    //
    // This slice spans BOTH supersession branches, and `toMatch(/\breturn;/)` is
    // neither global nor anchored, so a single surviving `return;` anywhere in it
    // satisfied the assertion: deleting the out-of-order branch's `return;` left
    // the gate green while a late `updated` re-pinned the mirror to the dead id.
    // Count them instead, so losing either one fails.
    const guard = stripeHelpers.slice(
      stripeHelpers.indexOf("const incomingIsTerminal"),
      stripeHelpers.indexOf("const userId = existing.userId"),
    );
    expect(guard).toContain("ignoring stale terminal event for a superseded subscription");
    expect((guard.match(/\breturn;/g) || []).length).toBe(2);

    // And bind each `return;` to its own branch, so two returns in one branch
    // cannot cover for a branch that has none.
    const terminalBranch = guard.slice(
      guard.indexOf("if (incomingIsTerminal && mirrorIsLive)"),
      guard.indexOf("if (await mirrorPointsAtNewerSubscription"),
    );
    const outOfOrderBranch = guard.slice(
      guard.indexOf("if (await mirrorPointsAtNewerSubscription"),
    );
    expect(terminalBranch, "terminal branch must return").toMatch(/\breturn;/);
    expect(outOfOrderBranch, "out-of-order branch must return").toMatch(/\breturn;/);
  });

  it("ignores an out-of-order non-terminal webhook for a superseded subscription", () => {
    // The terminal guard above only recognises a stale cancellation. A late
    // `customer.subscription.updated` for the replaced subscription arriving
    // after the replacement's `created` passes it and re-pins the one-row mirror
    // to the dead id — dragging that subscription's plan, status, and period end
    // onto a customer whose live subscription is something else entirely.
    //
    // Stripe does not guarantee delivery order and the mirror stores no event
    // sequence, so ordering has to be re-established from Stripe itself:
    // `created` is immutable and strictly increasing across a customer's
    // successive subscriptions.
    const stripeHelpers = read("src/lib/stripe-helpers.ts");

    const oracle = stripeHelpers.slice(
      stripeHelpers.indexOf("async function mirrorPointsAtNewerSubscription"),
      stripeHelpers.indexOf("export async function syncSubscriptionFromStripe"),
    );
    expect(oracle).toContain("await stripe.subscriptions.retrieve(mirroredSubscriptionId)");
    expect(oracle).toContain("return mirrored.created > sub.created");

    // A missing mirrored subscription cannot outrank anything, so the incoming
    // event must be allowed to repair the row. Retrying that forever would
    // poison the webhook.
    expect(oracle).toContain("if (isMissingStripeResource(error)) {");

    // Every other failure is transient. Swallowing it would force a guess in
    // exactly the case the guard exists to decide, so it must escape — the
    // webhook handler releases its idempotency claim and Stripe redelivers.
    expect(oracle).toMatch(/log\.error\([\s\S]*?\n\s*throw error;\n\s*\}/);

    // The guard must run on any id mismatch (not only terminal events) and must
    // actually skip the write.
    const guard = stripeHelpers.slice(
      stripeHelpers.indexOf("const incomingIsTerminal"),
      stripeHelpers.indexOf("const userId = existing.userId"),
    );
    expect(guard).toContain(
      "if (await mirrorPointsAtNewerSubscription(sub, existing.stripeSubscriptionId)) {",
    );
    expect(guard).toContain("ignoring out-of-order event for a superseded subscription");
    // Ordering is only ever consulted when the two ids disagree — a re-fetch on
    // every subscription webhook would be a needless Stripe call per event.
    expect(guard.indexOf("existing.stripeSubscriptionId !== sub.id")).toBeLessThan(
      guard.indexOf("mirrorPointsAtNewerSubscription(sub"),
    );
  });

  it("keeps one definition of the Stripe missing-resource test", () => {
    // Two copies had drifted: the account-deletion one read `raw.code`, the
    // checkout one did not. The Node SDK puts the API error code on `raw.code`
    // for StripeInvalidRequestError, so the weaker copy missed real
    // resource_missing responses and threw where it should have handled —
    // exactly the retry-posture decision this predicate exists to make.
    const stripeHelpers = read("src/lib/stripe-helpers.ts");
    expect(stripeHelpers).toContain("export function isMissingStripeResource(error: unknown)");
    expect(stripeHelpers).toContain('stripeError?.raw?.code === "resource_missing"');

    for (const path of [
      "src/lib/account-deletion-billing.ts",
      "src/routes/launch-billing-checkout-atomic-routes.ts",
    ] as const) {
      const source = read(path);
      expect(source, path).toContain("isMissingStripeResource");
      expect(source, path).not.toContain("function isMissingStripeResource");
    }
  });

  it("stops future renewal for both deletion APIs and resumes it after cancellation", () => {
    const accountRoutes = read("src/routes/account-routes.ts");
    const settingsRoutes = read("src/routes/settings-routes.ts");
    const deletionBilling = read("src/lib/account-deletion-billing.ts");
    const settings = read("src/pages/SettingsPage.tsx");

    expect(accountRoutes).toContain("stopRenewalForDeletion");
    expect(accountRoutes).toContain("renewal_stopped: renewal.confirmed");
    expect(settingsRoutes).toContain("stopRenewalForDeletion");
    expect(settingsRoutes).toContain("resumeRenewalAfterDeletionCancellation");
    expect(settingsRoutes).toContain("renewal_resumed: renewal.confirmed");
    expect(deletionBilling).toContain("cancel_at_period_end: true");
    expect(deletionBilling).toContain("cancel_at_period_end: false");
    expect(deletionBilling).toContain("stripe.subscriptions.list");
    expect(deletionBilling).toContain("for await");
    expect(deletionBilling).toContain("DELETION_RENEWAL_MARKER");
    expect(deletionBilling).toContain('metadata: { [DELETION_RENEWAL_MARKER]: "" }');
    expect(settings).toContain("Future subscription renewal is stopped");
    expect(settings).toContain('authFetch("/api/account/deletion-status"');
    expect(settings).toContain('authFetch("/api/account/cancel-deletion"');
    expect(settings).toContain("Keep my account");
    expect(settings).not.toContain("Billing continues until purge");
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
