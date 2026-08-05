import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

const migrationPath =
  "drizzle/migrations/0132_reclaim_abandoned_stripe_event_claims.sql";

describe("Stripe abandoned claim recovery", () => {
  it("owns recovery at the table INSERT boundary without a second HTTP preflight", () => {
    const migration = read(migrationPath);
    const parsers = read("src/lib/body-parsers.ts");
    const billing = read("src/routes/billing-routes.ts");

    expect(migration).toContain(
      "CREATE TRIGGER wireline_reclaim_abandoned_stripe_event_claim_before_insert",
    );
    expect(migration).toContain("BEFORE INSERT ON public.wireline_stripe_events");
    expect(migration).toContain(
      "EXECUTE FUNCTION public.wireline_reclaim_abandoned_stripe_event_claim()",
    );
    expect(parsers).not.toContain("stripe-webhook-claim-preflight");
    expect(parsers).not.toContain("reclaimAbandonedStripeWebhookClaim");
    expect(billing).toContain(
      '.values({ eventId: idempotencyKey, eventType: event.type, status: "processing" })',
    );
  });

  it("reclaims only the exact abandoned processing lease", () => {
    const migration = read(migrationPath);

    expect(migration).toContain("IF NEW.status <> 'processing' THEN");
    expect(migration).toContain("WHERE event_id = NEW.event_id");
    expect(migration).toContain("AND status = 'processing'");
    expect(migration).toContain("processed_at IS NULL");
    expect(migration).toContain(
      "processed_at < clock_timestamp() - INTERVAL '5 minutes'",
    );
    expect(migration).not.toMatch(/DELETE FROM public\.wireline_stripe_events\s*;/);
  });

  it("is idempotent, invoker-scoped, and preserves its migration sequence", () => {
    const migration = read(migrationPath);
    const accountClassification = read(
      "drizzle/migrations/0130_classify_nonproduction_traffic.sql",
    );
    const accountOperator = read(
      "drizzle/migrations/0131_manage_account_environment.sql",
    );
    const journal = JSON.parse(
      read("drizzle/migrations/meta/_journal.json"),
    ) as { entries: Array<{ tag: string }> };

    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.wireline_reclaim_abandoned_stripe_event_claim()",
    );
    expect(migration).toContain(
      "DROP TRIGGER IF EXISTS wireline_reclaim_abandoned_stripe_event_claim_before_insert",
    );
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).not.toContain("SECURITY DEFINER");
    expect(accountClassification).toContain("account_environment");
    expect(accountOperator).toContain("wireline_set_account_environment");

    const expectedSequence = [
      "0130_classify_nonproduction_traffic",
      "0131_manage_account_environment",
      "0132_reclaim_abandoned_stripe_event_claims",
    ];
    const tags = journal.entries.map(({ tag }) => tag);
    const sequenceStart = tags.indexOf(expectedSequence[0]);
    expect(sequenceStart).toBeGreaterThanOrEqual(0);
    expect(tags.slice(sequenceStart, sequenceStart + expectedSequence.length)).toEqual(
      expectedSequence,
    );
  });
});
