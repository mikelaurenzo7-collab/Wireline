import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("signup bootstrap integrity", () => {
  it("keeps both user-creation paths inside transactions with explicit bootstrap", () => {
    const passwordAuth = read("src/lib/auth-service.ts");
    const oauthAuth = read("src/routes/auth-oauth-routes.ts");

    expect(passwordAuth).toContain("return await drizzle.transaction(async (tx) =>");
    expect(passwordAuth).toContain("await startTrialForUser(user.id, signupAttribution, tx)");
    expect(oauthAuth).toContain("return drizzle.transaction(async (tx) =>");
    expect(oauthAuth).toContain("await startTrialForUser(created.id, {}, tx)");
    expect(oauthAuth).toContain("await startTrialForUser(existing.id, {}, tx)");
  });

  it("treats settings and spend-budget initialization as required", () => {
    const bootstrap = read("src/lib/trial-gate.ts");
    const start = bootstrap.slice(
      bootstrap.indexOf("export async function startTrialForUser"),
      bootstrap.indexOf("export async function saveSignupAttribution"),
    );

    expect(start).toContain("await tx");
    expect(start).toContain("schema.subscriptions.status");
    expect(start).toContain('subscription?.status === "active"');
    expect(start).toContain('subscription?.status === "trialing"');
    expect(start).toContain("ensureDefaultAiSpendBudget(userId, fundedPlanId, tx)");
    expect(start).not.toContain("continuing signup");
    expect(start).not.toContain("catch (");
  });

  it("backfills missing settings without inventing paid entitlement", () => {
    const migration = read("drizzle/migrations/0108_require_user_bootstrap.sql");

    expect(migration).toContain("INSERT INTO public.wireline_settings");
    expect(migration).toContain("LEFT JOIN public.wireline_subscriptions");
    expect(migration).toContain("ELSE 'pending_activation'");
    expect(migration).toContain("WHERE settings.user_id IS NULL");
    expect(migration).toContain("ON CONFLICT (user_id) DO NOTHING");
  });

  it("rejects a committed user missing settings or a spend guard", () => {
    const migration = read("drizzle/migrations/0108_require_user_bootstrap.sql");
    const journal = read("drizzle/migrations/meta/_journal.json");

    expect(migration).toContain("CREATE CONSTRAINT TRIGGER wireline_users_require_bootstrap");
    expect(migration).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(migration).toContain("FROM public.wireline_settings");
    expect(migration).toContain("FROM public.wireline_spend_budgets");
    expect(migration).toContain("ERRCODE = '23514'");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain(
      "REVOKE ALL ON FUNCTION public.wireline_assert_user_bootstrap() FROM PUBLIC",
    );
    expect(journal).toContain('"tag": "0108_require_user_bootstrap"');
  });
});
