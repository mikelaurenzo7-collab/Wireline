import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0131_manage_account_environment.sql"),
  "utf8",
);
const promotionGuard = readFileSync(
  resolve(process.cwd(), "drizzle/migrations/0163_guard_account_environment_promotion.sql"),
  "utf8",
);
const command = readFileSync(resolve(process.cwd(), "scripts/set-account-environment.ts"), "utf8");
const demoSeed = readFileSync(resolve(process.cwd(), "src/lib/demo-account-seed.ts"), "utf8");
const demoRoute = readFileSync(
  resolve(process.cwd(), "src/routes/admin-seed-demo-routes.ts"),
  "utf8",
);

describe("account environment operator contract", () => {
  it("keeps classification mutation behind a narrow privileged function", () => {
    expect(migration).toContain("wireline_set_account_environment");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
  });

  it("validates, locks, mutates, repairs, and audits atomically", () => {
    expect(migration).toContain("v_environment NOT IN ('production', 'test', 'demo')");
    expect(migration).toContain("char_length(v_reason) < 8");
    expect(migration).toContain("INTO STRICT");
    expect(migration).toContain("FOR UPDATE OF settings");
    expect(migration).toContain("SET account_environment = v_environment");
    expect(migration).toContain("wireline_audit_log.event_type = 'product.event'");
    expect(migration).toContain("'operator.account_environment'");
    expect(migration).toContain("'database_session_user', session_user");
  });

  it("requires explicit operator evidence before invoking the mutation", () => {
    expect(command).toContain('requireFlag(args, "email")');
    expect(command).toContain('requireFlag(args, "environment")');
    expect(command).toContain('requireFlag(args, "reason")');
    expect(command).toContain('requireFlag(args, "actor-email")');
    expect(command).toContain('requireFlag(args, "confirm-email")');
    expect(command).toContain('args.includes("--apply")');
    expect(command).toContain('args.includes("--confirm-production-promotion")');
    expect(command).toContain("confirmationEmail !== accountEmail");
    expect(command).toContain("wireline_set_account_environment($1, $2, $3, $4)");
    expect(command).toContain("BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    expect(command).toContain('client.query("COMMIT")');
    expect(command).toContain('client.query("ROLLBACK")');
    expect(command).toContain("resolveDatabaseConnection()");
    expect(command).toContain("Promotion preflight diagnostics");
  });

  it("replaces the live operator function with a fail-closed production preflight", () => {
    expect(promotionGuard).toContain("wireline_account_environment_promotion_preflight");
    expect(promotionGuard).toContain(
      "v_environment = 'production' AND v_previous_environment <> 'production'",
    );
    expect(promotionGuard).toContain("Production promotion refused");
    expect(promotionGuard).toContain("current_setting('transaction_isolation') <> 'serializable'");
    expect(promotionGuard).toContain("DETAIL = v_promotion_preflight::text");
    expect(promotionGuard).toContain("'promotion_preflight', v_promotion_preflight");
    expect(promotionGuard).toContain(
      "pg_advisory_xact_lock(hashtext('account-deletion:' || v_user_id::text))",
    );
  });

  it("requires audited demo classification and refuses Stripe customers before seeding", () => {
    expect(demoSeed).not.toContain('accountEnvironment: "demo"');
    expect(demoSeed).toContain('eq(schema.settings.accountEnvironment, "demo")');
    expect(demoSeed).toContain("classify the exact account as demo through the audited operator");
    expect(demoSeed).toContain("isNull(subscriptions.stripeCustomerId)");
    expect(demoSeed).toContain("isNull(subscriptions.stripeSubscriptionId)");
    expect(demoSeed).toContain("isNull(subscriptions.stripePriceId)");
    expect(demoSeed).toContain("Stripe-bound accounts cannot receive demo entitlement");

    const seedFunction = demoSeed.slice(
      demoSeed.indexOf("export async function seedDemoAccountData"),
    );
    expect(seedFunction.indexOf("await ensureDemoProSubscription(userId)")).toBeLessThan(
      seedFunction.indexOf("await drizzle.transaction"),
    );
    expect(demoRoute).not.toContain("ensureDemoProSubscription");
  });
});
