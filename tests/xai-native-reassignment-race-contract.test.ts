import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("native phone reassignment race", () => {
  it("detaches native routing before changing the assigned agent", () => {
    const assignment = read("src/lib/voice/native-phone-assignment.ts");
    const detach = assignment.indexOf("await deactivateNativeXAIPhoneLine({");
    const localMutation = assignment.indexOf('"phone_number_changed"');

    expect(detach).toBeGreaterThan(-1);
    expect(localMutation).toBeGreaterThan(-1);
    expect(detach).toBeLessThan(localMutation);
    expect(assignment).toContain("if (changesAgent)");
    expect(assignment).toContain("restorePreviousRouting");
    expect(assignment).toContain("configured Twilio failover");
  });

  it("binds the claim to tenant context before locking ownership and provider state", () => {
    const migration = read("drizzle/migrations/0153_preserve_xai_registration_ledger.sql");
    const nullGuard = migration.indexOf("XAI_PHONE_INVALID_CLAIM");
    const tenantContext = migration.indexOf(
      "public.wireline_current_user_id() IS DISTINCT FROM p_user_id",
      nullGuard,
    );
    const contextFailure = migration.indexOf("XAI_PHONE_TENANT_CONTEXT_MISMATCH", tenantContext);
    const advisoryLock = migration.indexOf("pg_advisory_xact_lock", contextFailure);
    const phoneSelect = migration.indexOf("SELECT phone.id", advisoryLock);
    const phoneRowLock = migration.indexOf("FOR UPDATE;", phoneSelect);
    const ownershipFailure = migration.indexOf("XAI_PHONE_OWNERSHIP_MISMATCH", phoneRowLock);
    const bindingSelect = migration.indexOf("FROM public.wireline_xai_phone_bindings", ownershipFailure);

    expect(nullGuard).toBeGreaterThan(-1);
    expect(tenantContext).toBeGreaterThan(nullGuard);
    expect(contextFailure).toBeGreaterThan(tenantContext);
    expect(advisoryLock).toBeGreaterThan(contextFailure);
    expect(phoneSelect).toBeGreaterThan(advisoryLock);
    expect(phoneRowLock).toBeGreaterThan(phoneSelect);
    expect(ownershipFailure).toBeGreaterThan(phoneRowLock);
    expect(bindingSelect).toBeGreaterThan(ownershipFailure);
    expect(migration).not.toContain("IF NOT EXISTS (\n    SELECT 1\n      FROM public.wireline_phone_numbers");
  });
});
