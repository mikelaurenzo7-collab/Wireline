import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

// Pins for the post-#1023 launch-readiness pass: the per-provider-call
// accounting checkpoint must stay visible to every subsystem that owns a
// piece of its lifecycle — Drizzle Kit, account deletion/export, metering,
// and checkout reconciliation.

describe("voice usage event table stays wired into the platform", () => {
  it("is exported from the canonical Drizzle schema entrypoint", () => {
    // drizzle.config.ts points at src/db/schema.ts. Without this re-export,
    // `drizzle-kit generate` sees no wireline_voice_usage_events table and
    // emits a DROP for the idempotency checkpoint.
    const schema = read("src/db/schema.ts");
    expect(schema).toContain('export * from "./voice-usage-schema";');
  });

  it("declares the FK and index that migration 0135 applied", () => {
    const table = read("src/db/voice-usage-schema.ts");
    expect(table).toContain('.references(() => users.id, { onDelete: "cascade" })');
    expect(table).toContain('index("idx_voice_usage_events_user_period")');
  });

  // The schema header's latest-migration line is pinned journal-derived in
  // tests/drizzle-schema-parity-contract.test.ts.

  it("is covered by account deletion and export", () => {
    const deletion = read("src/lib/account-deletion.ts");
    expect(deletion).toContain(
      '{ table: "wireline_voice_usage_events", userColumns: ["user_id"] }',
    );
  });

  it("refuses the call-log fallback id as a metering key", () => {
    // "unknown" is the callLogs fallback, not a provider call id. Metering on
    // it collapses every id-less call for a tenant onto one checkpoint row and
    // silently skips billing for all but the first.
    const usage = read("src/lib/voice-usage.ts");
    expect(usage).toContain('vapiCallId === "unknown"');
  });
});

describe("checkout guard matches webhook reconciliation's current-subscription set", () => {
  it("treats a paused subscription as live", () => {
    // stripe-helpers' CURRENT_PLAN_SUBSCRIPTION_STATUSES includes "paused" and
    // throws on two current subscriptions. If checkout does not also treat
    // paused as live, it creates the second subscription that makes every
    // webhook for that customer throw — the paying customer never receives
    // entitlements.
    const checkout = read("src/routes/launch-billing-checkout-atomic-routes.ts");
    expect(checkout).toContain('"paused"');
    const helpers = read("src/lib/stripe-helpers.ts");
    expect(helpers).toContain('"paused"');
  });
});
