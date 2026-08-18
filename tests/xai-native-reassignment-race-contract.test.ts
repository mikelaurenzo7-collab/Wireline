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

  it("binds tenant context before the caller-selected lock and ownership proof", () => {
    const migration = read("drizzle/migrations/0153_preserve_xai_registration_ledger.sql");
    const nullGuard = migration.indexOf("XAI_PHONE_INVALID_CLAIM");
    const tenantContext = migration.indexOf(
      "public.wireline_current_user_id() IS DISTINCT FROM p_user_id",
      nullGuard,
    );
    const tenantFailure = migration.indexOf("XAI_PHONE_TENANT_MISMATCH", tenantContext);
    const advisoryLock = migration.indexOf("pg_advisory_xact_lock", tenantFailure);
    const phoneProof = migration.indexOf("FROM public.wireline_phone_numbers", advisoryLock);
    const phoneRowLock = migration.indexOf("FOR UPDATE;", phoneProof);
    const ownershipFailure = migration.indexOf("XAI_PHONE_OWNERSHIP_MISMATCH", phoneRowLock);
    const bindingSelect = migration.indexOf("FROM public.wireline_xai_phone_bindings", ownershipFailure);

    expect(nullGuard).toBeGreaterThan(-1);
    expect(tenantContext).toBeGreaterThan(nullGuard);
    expect(tenantFailure).toBeGreaterThan(tenantContext);
    expect(advisoryLock).toBeGreaterThan(tenantFailure);
    expect(phoneProof).toBeGreaterThan(advisoryLock);
    expect(phoneRowLock).toBeGreaterThan(phoneProof);
    expect(ownershipFailure).toBeGreaterThan(phoneRowLock);
    expect(bindingSelect).toBeGreaterThan(ownershipFailure);
  });

  it("keeps the definer function locked to the server role", () => {
    const migration = read("drizzle/migrations/0153_preserve_xai_registration_ledger.sql");

    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain(
      "FROM PUBLIC, anon, authenticated, service_role",
    );
    expect(migration).toContain("TO wireline_server");
  });
});
