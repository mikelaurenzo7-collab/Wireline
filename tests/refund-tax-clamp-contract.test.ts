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
 * debt they never spent. Refunds flow through creditPortionUsd; authoritative
 * dispute balance movements flow through proportionalTopUpCreditUsd in the
 * strict preflight. Both scale gross → credited using the PaymentIntent's
 * credit_usd metadata and round down so partial reversals cannot exceed grant.
 */
describe("refund tax-clamp contract", () => {
  const billing = read("src/routes/billing-routes.ts");
  const fulfillment = read("src/lib/stripe-checkout-fulfillment.ts");
  const strictPreflight = read("src/middleware/stripe-runtime-allowance-retry.ts");

  it("defines the proportional clamp against PaymentIntent credit_usd metadata", () => {
    expect(billing).toContain("function creditPortionUsd");
    const fn = billing.slice(billing.indexOf("function creditPortionUsd"));
    expect(fn.slice(0, 700)).toContain("pi.metadata?.credit_usd");
    // Rounds DOWN so cumulative partials never exceed the granted credit.
    expect(fn.slice(0, 700)).toContain("Math.floor");
    expect(fn.slice(0, 700)).toContain("Math.min(creditUsd");
  });

  it("every refund and dispute reversal flows through the clamp — no raw gross amounts", () => {
    // Both refund events use one shared handler and its local clamp. Dispute withdrawal/reinstatement
    // moved into the strict preflight so provider balance movements cannot be
    // acknowledged without authoritative, idempotent accounting.
    const calls = billing.match(/creditPortionUsd\(/g) || [];
    expect(calls).toHaveLength(2); // definition + shared settled-refund handler
    expect(billing).toContain(
      "await reverseSettledRefundsForCharge(event.data.object as Stripe.Charge, event)",
    );
    expect(billing).toContain("await reverseSettledRefundsForCharge(charge, event, false)");
    expect(billing).toContain(
      'reverseCredit(userId, creditPortionUsd(refund.amount, pi), "web_topup_refund"',
    );
    expect(strictPreflight).toContain("proportionalTopUpCreditUsd(");
    expect(strictPreflight).toMatch(
      /proportionalTopUpCreditUsd\(\s*withdrawnCents,\s*paymentIntent\.amount \|\| 0,\s*purchasedCreditUsd/,
    );
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
