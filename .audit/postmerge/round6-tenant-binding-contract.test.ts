import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-6 native phone-line tenant binding", () => {
  const carrier = read("src/routes/carrier-routes.ts");
  const nativeRouting = read("src/routes/native-phone-routing-routes.ts");
  const nativeProvisioning = read("src/lib/voice/native-phone-provisioning.ts");
  const registry = read("src/server/register-api-routes.ts");

  it("retires manual Vapi claims and gives native routing precedence", () => {
    const manual = carrier.slice(
      carrier.indexOf('"/api/phone-numbers",'),
      carrier.indexOf('"/api/phone-numbers/provision"'),
    );
    expect(manual).toContain("status(410)");
    expect(manual).toContain('code: "NATIVE_PHONE_REQUIRED"');
    expect(registry.indexOf("app.use(nativePhoneRoutingRouter)")).toBeGreaterThan(-1);
    expect(registry.indexOf("app.use(nativePhoneRoutingRouter)")).toBeLessThan(
      registry.indexOf("app.use(carrierRouter)"),
    );
  });

  it("checks capacity before purchase and again inside the ownership transaction", () => {
    const entitlement = nativeProvisioning.indexOf("getIncludedPhoneLineSlots(input.userId)");
    const preflightCount = nativeProvisioning.indexOf(
      ".where(eq(schema.phoneNumbers.userId, input.userId))",
      entitlement,
    );
    const purchase = nativeProvisioning.indexOf("purchaseNativeNumber(input)");
    const lockedCount = nativeProvisioning.indexOf("const [{ held }] = await tx", 0);
    const insert = nativeProvisioning.indexOf(".insert(schema.phoneNumbers)", lockedCount);

    expect(entitlement).toBeGreaterThan(-1);
    expect(preflightCount).toBeGreaterThan(entitlement);
    expect(purchase).toBeGreaterThan(preflightCount);
    expect(lockedCount).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(lockedCount);
    expect(nativeProvisioning).toContain('kind: "capacity"');
    expect(nativeProvisioning).toContain('code: "PHONE_CAPACITY_REACHED"');
    expect(nativeProvisioning).toContain("releasePurchasedNativeNumber");
  });

  it("binds every native line and agent lookup to the authenticated workspace", () => {
    expect(nativeProvisioning).toContain("eq(schema.agents.userId, input.userId)");
    expect(nativeProvisioning).toContain("userId: input.userId");
    expect(nativeProvisioning).toContain("eq(schema.phoneNumbers.userId, input.userId)");
    expect(nativeRouting).toContain("userId: req.user.id");
    expect(nativeRouting).toContain("assignNativePhoneLine");
    expect(nativeRouting).toContain("provisionNativeTenantNumber");
  });

  it("keeps storage backstops for legacy and native provider identities", () => {
    const schemaSrc = read("src/db/schema.ts");
    expect(schemaSrc).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_numbers_vapi_number_id_unique",
    );
    const legacyMigration = read("drizzle/migrations/0111_phone_number_tenant_binding.sql");
    expect(legacyMigration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(legacyMigration).toContain("idx_phone_numbers_user_id");

    const nativeMigration = read("drizzle/migrations/0152_native_xai_phone_bindings.sql");
    expect(nativeMigration).toContain("UNIQUE (tenant_id, agent_id)");
    expect(nativeMigration).toContain("UNIQUE (phone_number)");
  });
});

describe("round-6 agent-create capacity serialization", () => {
  it("serializes the mobile create path the same way the web path is", () => {
    const mobile = read("src/routes/mobile-routes.ts");
    const create = mobile.slice(
      mobile.indexOf('"/api/mobile/agents",'),
      mobile.indexOf('router.get(\n  "/api/mobile/agents"'),
    );
    const lockIdx = create.indexOf("pg_advisory_xact_lock");
    const countIdx = create.indexOf("count(*)");
    const insertIdx = create.indexOf("tx.insert(schema.agents)");

    expect(lockIdx).toBeGreaterThan(-1);
    expect(countIdx).toBeGreaterThan(lockIdx);
    expect(insertIdx).toBeGreaterThan(countIdx);
    expect(create).toContain("AGENT_CAPACITY_REACHED");
  });
});
