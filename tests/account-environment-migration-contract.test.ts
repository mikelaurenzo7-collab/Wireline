import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0130_classify_nonproduction_traffic.sql"),
  "utf8",
);

describe("account environment analytics contract", () => {
  it("defaults future accounts to production after classifying the pre-launch cohort", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS account_environment text");
    expect(migration).toContain("THEN 'demo'");
    expect(migration).toContain("ELSE 'test'");
    expect(migration).toContain("ALTER COLUMN account_environment SET DEFAULT 'production'");
    expect(migration).toContain("ALTER COLUMN account_environment SET NOT NULL");
    expect(migration).toContain(
      "CHECK (account_environment IN ('production', 'test', 'demo'))",
    );
  });

  it("derives durable product-event classification on the server", () => {
    expect(migration).toContain("wireline_tag_product_event_environment");
    expect(migration).toContain("NEW.event_type IS DISTINCT FROM 'product.event'");
    expect(migration).toContain("WHERE settings.user_id = NEW.user_id");
    expect(migration).toContain("'account_environment', resolved_environment");
    expect(migration).toContain("'demo_account', resolved_environment <> 'production'");
    expect(migration).toContain(
      "BEFORE INSERT OR UPDATE OF user_id, event_type, metadata",
    );
  });

  it("repairs historical product-event metadata from tenant truth", () => {
    expect(migration).toContain("UPDATE public.wireline_audit_log AS audit");
    expect(migration).toContain("audit.user_id = settings.user_id");
    expect(migration).toContain("audit.event_type = 'product.event'");
    expect(migration).toContain(
      "'demo_account', settings.account_environment <> 'production'",
    );
  });
});
