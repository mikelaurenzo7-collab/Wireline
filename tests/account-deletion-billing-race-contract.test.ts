import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("account deletion versus payable billing", () => {
  it("uses a durable lease across hosted billing responses without pinning the pool", () => {
    const middleware = read("src/middleware/account-deletion-billing-fence.ts");
    const fencedRoutes = [
      "src/routes/launch-billing-checkout-atomic-routes.ts",
      "src/routes/launch-billing-checkout-routes.ts",
      "src/routes/conversation-balance-routes.ts",
      "src/routes/billing-portal-readiness-routes.ts",
    ];

    const environment = middleware.indexOf("liveExternalActionPolicyForUser(req.user.id)");
    const lease = middleware.indexOf("await acquireAccountOperationLease");
    const handoff = middleware.indexOf("next();", lease);
    expect(environment).toBeGreaterThan(-1);
    expect(lease).toBeGreaterThan(environment);
    expect(handoff).toBeGreaterThan(lease);
    expect(middleware).not.toContain("drizzle.transaction");
    expect(middleware).toContain('res.once("finish", onFinish)');
    expect(middleware).toContain('res.once("close", onClose)');
    expect(middleware).toContain("releaseAccountOperationLease");
    expect(middleware).toContain("Do not release: Stripe may still be in flight");
    expect(middleware).toContain('code: "ACCOUNT_DELETION_PENDING"');
    for (const route of fencedRoutes) {
      expect(read(route), route).toContain("fencePayableBillingDuringAccountDeletion");
    }
  });

  it("commits the pending marker before Stripe closure and reconciles ambiguity", () => {
    const request = read("src/lib/account-deletion-request.ts");
    const billing = read("src/lib/account-deletion-billing.ts");

    const lock = request.indexOf("await acquireAccountDeletionFence");
    const marker = request.indexOf(".insert(schema.deletionQueue)", lock);
    const transactionEnd = request.indexOf("}, writeTransactionConfig());", marker);
    const closure = request.indexOf("await stopRenewalForDeletion", transactionEnd);
    expect(lock).toBeGreaterThan(-1);
    expect(marker).toBeGreaterThan(lock);
    expect(transactionEnd).toBeGreaterThan(marker);
    expect(closure).toBeGreaterThan(transactionEnd);
    expect(request).toContain('"BILLING_OPERATION_IN_FLIGHT"');
    expect(read("src/routes/settings-routes.ts")).toContain(
      "if (err instanceof AppError) throw err;",
    );
    expect(billing).toContain("expireOpenCheckoutSessionsForDeletion");
    expect(billing).toContain("stripe.checkout.sessions.retrieve");
    expect(billing).toContain("stripe.checkout.sessions.list");
    expect(billing).toContain("stripe.checkout.sessions.expire");
    expect(billing).toContain('status: "expired", checkoutUrl: null');
    expect(request).toContain('type: "account_deletion_billing_reconciliation"');
    expect(request).toContain('inArray(schema.jobs.status, ["pending", "running", "failed"])');
  });

  it("retries ambiguous Stripe closure durably and stops after deletion cancellation", () => {
    const queue = read("src/lib/job-queue.ts");
    const worker = read("src/lib/job-worker.ts");
    const branch = worker.slice(
      worker.indexOf('job.type === "account_deletion_billing_reconciliation"'),
      worker.indexOf('job.type === "ai_spend_accounting"'),
    );

    expect(queue).toContain('"account_deletion_billing_reconciliation"');
    expect(branch).toContain('eq(schema.deletionQueue.status, "pending")');
    expect(branch).toContain('reason: "deletion_not_pending"');
    expect(branch).toContain("await stopRenewalForDeletion(userId)");
    expect(branch).toContain("if (!closure.confirmed)");
  });

  it("repeats checkout closure and erases the owned Stripe customer before local purge", () => {
    const deletion = read("src/lib/account-deletion.ts");
    const closeSessions = deletion.indexOf("expireOpenCheckoutSessionsForDeletion");
    const cancelSubscriptions = deletion.indexOf("stripe.subscriptions.cancel", closeSessions);
    const deleteCustomers = deletion.indexOf("stripe.customers.del", cancelSubscriptions);
    const localPurge = deletion.indexOf("async function purgeAccountOutsideTenantContext");

    expect(closeSessions).toBeGreaterThan(-1);
    expect(cancelSubscriptions).toBeGreaterThan(closeSessions);
    expect(deleteCustomers).toBeGreaterThan(cancelSubscriptions);
    expect(localPurge).toBeGreaterThan(deleteCustomers);
    expect(deletion).toContain("stripeCustomersDeleted");
  });

  it("allows capacity reductions but blocks new paid capacity during deletion", () => {
    const route = read("src/routes/extra-agent-billing-atomic-routes.ts");
    const lock = route.indexOf("await acquireAccountDeletionFence");
    const deletion = route.indexOf("inArray(schema.deletionQueue.status", lock);
    const increase = route.indexOf("const isIncrease", deletion);
    const block = route.indexOf("if (deletion && isIncrease)", increase);
    const providerMutation = route.indexOf("stripe.subscriptionItems", block);

    expect(lock).toBeGreaterThan(-1);
    expect(deletion).toBeGreaterThan(lock);
    expect(block).toBeGreaterThan(increase);
    expect(providerMutation).toBeGreaterThan(block);
  });
});
