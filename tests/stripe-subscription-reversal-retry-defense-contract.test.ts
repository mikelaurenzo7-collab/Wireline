import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("Stripe subscription allowance reversal retry defense", () => {
  const billing = read("src/routes/billing-routes.ts");
  const strictPreflight = read("src/middleware/stripe-runtime-allowance-retry.ts");
  const claims = read("src/lib/stripe-event-claim.ts");
  const allowance = read("src/lib/subscription-welcome-credit.ts");

  it("propagates shared refund routing failures to the outer webhook rollback", () => {
    const helperStart = billing.indexOf("async function reverseSettledRefundsForCharge(");
    const helperEnd = billing.indexOf("async function ", helperStart + 1);
    expect(helperStart).toBeGreaterThan(-1);
    expect(helperEnd).toBeGreaterThan(helperStart);
    const helper = billing.slice(helperStart, helperEnd);
    expect(billing).not.toContain("async function reverseRuntimeAllowanceForCharge");
    expect(helper).toContain("await reconcileStripeTopUpRefunds({");
    expect(helper).toContain("await reverseSubscriptionRuntimeAllowanceForChargeStrict(");
    expect(helper).not.toMatch(/\bcatch\s*\(/);
    expect(helper).not.toContain("Never fail the webhook on this path");

    const outerFailure = billing.slice(billing.indexOf('log.error("Stripe webhook handler error"'));
    expect(outerFailure).toContain("releaseStripeEventClaim(claim)");
    expect(claims).toContain("eq(schema.stripeEvents.claimToken, claim.claimToken)");
    expect(outerFailure).toContain('throw AppError.fromHttpStatus(500, "Webhook handler failed")');
  });

  it("keeps the active strict preflight fail-closed before the legacy router", () => {
    expect(strictPreflight).toContain("claimOrRespondDuplicate");
    expect(strictPreflight).toContain("releaseStripeEventClaim(claim)");
    expect(strictPreflight).toContain(
      'next(AppError.fromHttpStatus(500, "Webhook handler failed"))',
    );
  });

  it("records Stripe event and object provenance on subscription reversals", () => {
    expect(allowance).toContain("providerEventId?: string");
    expect(allowance).toContain("providerObjectId?: string");
    expect(allowance).toContain("providerEventId: provenance?.providerEventId");
    expect(allowance).toContain(
      "providerObjectId: provenance?.providerObjectId ?? reversalReference",
    );

    expect(strictPreflight).toContain("{ providerEventId, providerObjectId: reference }");
    expect(strictPreflight).toContain("{ providerEventId, providerObjectId: refund.id }");
    // Preserve exact argument ownership/provenance, independent of indentation
    // introduced by the conditional returned-refund branch.
    expect(strictPreflight).toMatch(
      /reverseSubscriptionRuntimeAllowanceForChargeStrict\(\s*charge,\s*"refund",\s*undefined,\s*undefined,\s*event\.id,\s*expectation,\s*\)/,
    );
    expect(strictPreflight).toMatch(
      /reverseSubscriptionRuntimeAllowanceForChargeStrict\(\s*charge,\s*"dispute",\s*dispute\.id,\s*movementCents,\s*event\.id,\s*\)/,
    );
  });
});

describe("Stripe reversal reconciliation query", () => {
  const query = read("scripts/sql/audit-stripe-runtime-allowance-reversal-gaps.sql");

  it("is read-only and reports processed financial events without linked movements", () => {
    expect(query).toContain("WITH financial_events AS");
    expect(query).toContain("wireline_stripe_events");
    expect(query).toContain("wireline_credit_ledger");
    expect(query).toContain("provider_event_id");
    expect(query).toContain("linked_movement_count");
    expect(query).toContain("coalesce(movement.movement_count, 0) = 0");
    expect(query).toContain("charge.refunded");
    expect(query).toContain("charge.dispute.funds_withdrawn");
    expect(query).toContain("charge.dispute.funds_reinstated");
    expect(query).not.toMatch(
      /\b(?:insert|update|delete|alter|drop|truncate)\s+(?:into\s+)?wireline_/i,
    );
  });

  it("requires human Stripe verification before any correction", () => {
    expect(query).toContain("operator review queue, not an automatic correction");
    expect(query).toContain("Never insert an ad hoc debit from this report alone");
    expect(query).toContain("review Stripe charge/invoice/subscription ownership");
  });
});
