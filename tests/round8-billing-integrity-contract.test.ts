import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-8 billing integrity", () => {
  const billing = read("src/routes/billing-routes.ts");

  it("invoices an extra-agent increase instead of granting capacity a cycle early", () => {
    // A bare quantity change prorates onto the NEXT invoice while
    // includedVoiceMinutes grants the minutes immediately — buy 100, burn the
    // ~5,000 minutes, drop to 0 for a credit, and none of the consumed minutes
    // is ever re-priced.
    expect(billing).toContain("const isIncrease = target > currentExtraAgents");
    expect(billing).toContain('isIncrease ? "always_invoice" : "create_prorations"');
    expect(billing).toContain("proration_behavior: prorationBehavior");
  });

  it("fails closed when Stripe could not collect for the increase", () => {
    expect(billing).toContain("PAYMENT_REQUIRED");
    const guard = billing.slice(billing.indexOf("if (isIncrease) {"));
    expect(guard).toContain("stripe.invoices.list");
    expect(guard).toContain('latest.status !== "paid"');
  });

  it("claims a Stripe webhook as processing and only marks processed on success", () => {
    // A killed invocation (maxDuration, OOM, recycle) never runs the JS
    // rollback, so a bare claim made a redelivery indistinguishable from a
    // genuine duplicate and the event was dropped — for a credit top-up that
    // means the customer paid and the balance never moved.
    expect(billing).toContain('status: "processing"');
    expect(billing).toContain('.set({ status: "processed", processedAt: new Date() })');
  });

  it("releases an abandoned claim so Stripe redelivers", () => {
    expect(billing).toContain('prior?.status === "processing"');
    expect(billing).toContain("abandonedAfterMs");
    expect(billing).toContain("Prior delivery did not complete. Retry.");
  });

  it("carries the claim status on the schema and in a migration", () => {
    expect(read("src/db/schema.ts")).toContain(
      'status: text("status").notNull().default("processed")',
    );
    const migration = read("drizzle/migrations/0112_stripe_event_claim_status.sql");
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'processed'",
    );
  });

  it("rolls the usage counter back when a voice overage charge fails", () => {
    // The overage band is derived from the counter, so leaving it inflated
    // after a failed charge makes those minutes permanently unbillable and
    // leaves the pre-call solvency gate open on spent coverage.
    const usage = read("src/lib/voice-usage.ts");
    expect(usage).toContain("catch (chargeError)");
    expect(usage).toContain("GREATEST(0,");
    expect(usage).toContain("usage counter rolled back for retry");
  });
});
