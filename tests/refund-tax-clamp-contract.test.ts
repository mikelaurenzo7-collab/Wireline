import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * Contract: refund/dispute reversals claw back only the credit that was
 * actually granted, not the tax-inclusive gross.
 *
 * When Automatic Tax is enabled, top-up checkouts credit the pre-tax
 * `credit_usd` (Checkout fulfillment handler). The refund and dispute
 * handlers used to reverse the GROSS Stripe amount (refund.amount /
 * dispute.amount / amount_refunded), so with exclusive tax a fully-refunded
 * customer landed at a negative wallet and was blocked on completion-grace
 * debt they never spent. Refunds use the immutable posted Checkout credit;
 * dispute balance movements flow through proportionalTopUpCreditUsd in the
 * strict preflight. Both scale gross → actual posted credit and round down
 * so partial reversals cannot exceed the grant, even if metadata later changes.
 */
describe("refund tax-clamp contract", () => {
  const billing = read("src/routes/billing-routes.ts");
  const fulfillment = read("src/lib/stripe-checkout-fulfillment.ts");
  const strictPreflight = read("src/middleware/stripe-runtime-allowance-retry.ts");
  const topups = read("src/lib/stripe-topup-refund-reconciliation.ts");

  it("clamps refunds against original posted credit rather than mutable metadata", () => {
    expect(topups).toContain("wholeCents(original.deltaUsd)");
    expect(topups).toContain("BigInt(refund.amount) * BigInt(grantCents)");
    expect(topups).toContain("/ BigInt(charge.amount)");
    expect(topups).toContain("netDebitedCents > grantCents");
    expect(topups).not.toContain("pi.metadata?.credit_usd");
  });

  it("every refund and dispute reversal flows through the clamp — no raw gross amounts", () => {
    // Both refund events use one shared handler and its local clamp. Dispute withdrawal/reinstatement
    // moved into the strict preflight so provider balance movements cannot be
    // acknowledged without authoritative, idempotent accounting.
    expect(billing).not.toContain("function creditPortionUsd");
    expect(billing).toContain(
      "await reverseSettledRefundsForCharge(event.data.object as Stripe.Charge, event)",
    );
    expect(billing).toContain("await reverseSettledRefundsForCharge(charge, event, false)");
    expect(billing).toContain("await reconcileStripeTopUpRefunds({");
    expect(strictPreflight).toContain("proportionalTopUpCreditUsd(");
    expect(strictPreflight).toMatch(
      /proportionalTopUpCreditUsd\(\s*withdrawnCents,\s*context\.charge\.amount,\s*purchasedCreditUsd/,
    );
    expect(strictPreflight).toContain("const purchasedCreditUsd = context.grantCents / 100");
    // The old raw-gross patterns must be gone from reverseCredit call sites.
    expect(billing).not.toMatch(/reverseCredit\(userId,\s*\(refund\.amount \?\? 0\) \/ 100/);
    expect(billing).not.toMatch(
      /reverseCredit\(\s*userId,\s*\(charge\.amount_refunded \?\? 0\) \/ 100/,
    );
    expect(billing).not.toMatch(/const disputedUsd = \(dispute\.amount \?\? 0\) \/ 100/);
    expect(strictPreflight).not.toMatch(/reverseCredit\([^)]*\(dispute\.amount \?\? 0\) \/ 100/);
  });

  it("the top-up grant stays pre-tax so the clamp numerator matches the grant", () => {
    // Shared webhook/redirect fulfillment credits Number(session.metadata.credit_usd);
    // if this ever changes to a gross amount the clamp must change with it.
    expect(fulfillment).toContain("const creditUsd = Number(session.metadata.credit_usd)");
    expect(fulfillment).toMatch(/addCredit\(userId, creditUsd, "web_topup"/);
  });
});
