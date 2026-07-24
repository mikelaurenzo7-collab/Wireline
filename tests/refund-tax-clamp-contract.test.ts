import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * Contract: refund/dispute reversals claw back only the credit that was
 * actually granted, not the tax-inclusive gross.
 *
 * Top-up checkouts run with automatic_tax enabled but credit the pre-tax
 * `credit_usd` (checkout.session.completed handler). The refund and dispute
 * handlers used to reverse the GROSS Stripe amount (refund.amount /
 * dispute.amount / amount_refunded), so with exclusive tax a fully-refunded
 * customer landed at a negative wallet and was blocked on completion-grace
 * debt they never spent. Every reversal must flow through creditPortionUsd,
 * which scales gross → credited using the PaymentIntent's credit_usd
 * metadata and rounds down so partial reversals can never exceed the grant.
 */
describe("refund tax-clamp contract", () => {
  const billing = read("src/routes/billing-routes.ts");

  it("defines the proportional clamp against PaymentIntent credit_usd metadata", () => {
    expect(billing).toContain("function creditPortionUsd");
    const fn = billing.slice(billing.indexOf("function creditPortionUsd"));
    expect(fn.slice(0, 700)).toContain("pi.metadata?.credit_usd");
    // Rounds DOWN so cumulative partials never exceed the granted credit.
    expect(fn.slice(0, 700)).toContain("Math.floor");
    expect(fn.slice(0, 700)).toContain("Math.min(creditUsd");
  });

  it("every refund and dispute reversal flows through the clamp — no raw gross amounts", () => {
    // All four reversal sites (inline refunds, fetched fallback, cumulative
    // last-resort, dispute) must use creditPortionUsd.
    const calls = billing.match(/creditPortionUsd\(/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(5); // definition + 4 sites
    // The old raw-gross patterns must be gone from reverseCredit call sites.
    expect(billing).not.toMatch(/reverseCredit\(userId,\s*\(refund\.amount \?\? 0\) \/ 100/);
    expect(billing).not.toMatch(
      /reverseCredit\(\s*userId,\s*\(charge\.amount_refunded \?\? 0\) \/ 100/,
    );
    expect(billing).not.toMatch(/const disputedUsd = \(dispute\.amount \?\? 0\) \/ 100/);
  });

  it("the top-up grant stays pre-tax so the clamp numerator matches the grant", () => {
    // checkout.session.completed credits Number(session.metadata.credit_usd);
    // if this ever changes to a gross amount the clamp must change with it.
    expect(billing).toContain("const creditUsd = Number(session.metadata.credit_usd)");
    expect(billing).toMatch(/addCredit\(userId, creditUsd, "web_topup"/);
  });
});
