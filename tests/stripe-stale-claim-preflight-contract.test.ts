import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

describe("Stripe stale webhook claim preflight", () => {
  it("runs after raw parsing and before the canonical billing router", () => {
    const parsers = read("src/lib/body-parsers.ts");
    const server = read("server.ts");

    expect(parsers).toContain(
      'import { reclaimAbandonedStripeWebhookClaim } from "../middleware/stripe-webhook-claim-preflight";',
    );

    const rawParser = parsers.indexOf('express.raw({ type: "application/json"');
    const preflight = parsers.indexOf(
      'app.use("/api/stripe-webhook", reclaimAbandonedStripeWebhookClaim);',
    );
    expect(rawParser).toBeGreaterThan(-1);
    expect(preflight).toBeGreaterThan(rawParser);

    const parserInstall = server.indexOf("installWebhookBodyParsers(app)");
    const routeInstall = server.indexOf("registerApiRoutes(app)");
    expect(parserInstall).toBeGreaterThan(-1);
    expect(routeInstall).toBeGreaterThan(parserInstall);
  });

  it("mutates claim state only after Stripe signature verification", () => {
    const source = read("src/middleware/stripe-webhook-claim-preflight.ts");

    const signatureVerification = source.indexOf("stripe.webhooks.constructEvent(");
    const claimDelete = source.indexOf(".delete(schema.stripeEvents)");
    expect(signatureVerification).toBeGreaterThan(-1);
    expect(claimDelete).toBeGreaterThan(signatureVerification);
    expect(source).toContain('eq(schema.stripeEvents.status, "processing")');
    expect(source).toContain("lt(schema.stripeEvents.processedAt, cutoff)");
    expect(source).toContain("ABANDONED_STRIPE_CLAIM_AFTER_MS = 5 * 60 * 1000");
  });

  it("fails closed when the idempotency store cannot complete the preflight", () => {
    const source = read("src/middleware/stripe-webhook-claim-preflight.ts");

    expect(source).toContain('log.error("Stripe stale-claim preflight failed closed"');
    expect(source).toContain(
      'AppError.fromHttpStatus(503, "Webhook idempotency store unavailable. Retry later.")',
    );
    expect(source).not.toContain(".catch(() => []");
  });
});
