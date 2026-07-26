import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("subscription Runtime Allowance refunds fail closed", () => {
  const middleware = read("src/middleware/stripe-runtime-allowance-retry.ts");
  const registry = read("src/server/register-api-routes.ts");

  it("mounts the strict preflight before the legacy billing router", () => {
    const strictMount = registry.indexOf(
      'app.use("/api/stripe-webhook", stripeRuntimeAllowanceRetryPreflight)',
    );
    const billingMount = registry.indexOf('app.use("/api", billingRouter)');

    expect(strictMount).toBeGreaterThan(-1);
    expect(billingMount).toBeGreaterThan(strictMount);
  });

  it("uses authoritative refund objects and one idempotency key per partial refund", () => {
    expect(middleware).toContain("stripe.refunds.list");
    expect(middleware).toContain("starting_after: startingAfter");
    expect(middleware).toContain("refund.id,");
    expect(middleware).toContain("refund.amount / chargeCents");
    expect(middleware).not.toContain("amount_refunded under charge.id");
  });

  it("lets credit top-ups retain the canonical wallet-refund path", () => {
    expect(middleware).toContain(
      'if (paymentIntent.metadata?.purpose === "credit_topup") return next()',
    );
  });

  it("never acknowledges a failed subscription allowance reversal", () => {
    const failureBlock = middleware.slice(
      middleware.indexOf('log.error("subscription Runtime Allowance reversal failed'),
    );
    expect(failureBlock).toContain('next(AppError.fromHttpStatus(500, "Webhook handler failed"))');
    expect(failureBlock).not.toContain("res.json");
  });

  it("only responds success after the strict reversal resolves", () => {
    const refundBlock = middleware.slice(
      middleware.indexOf('if (event.type === "charge.refunded")'),
      middleware.indexOf('if (event.type === "charge.dispute.created")'),
    );
    const reverse = refundBlock.indexOf(
      "await reverseSubscriptionRuntimeAllowanceForChargeStrict(charge, \"refund\")",
    );
    const response = refundBlock.indexOf("res.json");
    expect(reverse).toBeGreaterThan(-1);
    expect(response).toBeGreaterThan(reverse);
  });
});
