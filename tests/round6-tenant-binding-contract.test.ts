import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("round-6 phone-line tenant binding", () => {
  it("gates native search, claim, and provision on plan capacity", () => {
    const native = read("src/routes/native-phone-routing-routes.ts");
    const provisioning = read("src/lib/voice/native-phone-provisioning.ts");

    expect(native).toContain("capacityAvailable");
    expect(native).toContain("getIncludedPhoneLineSlots(req.user.id)");
    expect(native).toContain("PHONE_CAPACITY_REACHED");
    expect(native).toContain('"/api/phone-numbers/search"');
    expect(native).toContain('"/api/phone-numbers/claim"');
    expect(native).toContain('"/api/phone-numbers/provision"');
    expect(provisioning).toContain("getIncludedPhoneLineSlots(input.userId)");
    expect(provisioning).toContain("PHONE_CAPACITY_REACHED");
  });

  it("tombs the Vapi bind POST so a mount-order regression cannot adopt a foreign line", () => {
    const carrier = read("src/routes/carrier-routes.ts");
    const handler = carrier.slice(
      carrier.indexOf("function nativePhoneRequired"),
      carrier.indexOf('"/api/phone-numbers/provision"'),
    );
    expect(handler).toContain("NATIVE_PHONE_REQUIRED");
    expect(handler).toContain("410");
    expect(handler).not.toContain("NUMBER_ALREADY_BOUND");
    expect(handler).not.toContain("getIncludedPhoneLineSlots(req.user.id)");
  });

  it("keeps storage-layer uniqueness for Twilio SIDs, E.164 SIP bindings, and rollback Vapi ids", () => {
    const schemaSrc = read("src/db/schema-base.ts");
    expect(schemaSrc).toContain('phoneNumber: text("phone_number").unique().notNull()');
    expect(schemaSrc).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_phone_numbers_vapi_number_id_unique",
    );
    const migration = read("drizzle/migrations/0111_phone_number_tenant_binding.sql");
    expect(migration).toContain("CREATE UNIQUE INDEX IF NOT EXISTS");
    expect(migration).toContain("idx_phone_numbers_user_id");

    const nativeBindings = read("drizzle/migrations/0152_native_xai_phone_bindings.sql");
    expect(nativeBindings).toContain("CREATE UNIQUE INDEX IF NOT EXISTS uq_xai_phone_bindings_phone");
    expect(nativeBindings).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS uq_xai_phone_bindings_twilio_phone",
    );

    const resolver = read("src/lib/vapi-webhook-agent.ts");
    expect(resolver).toContain("eq(schema.phoneNumbers.vapiNumberId, phoneNumberId)");
  });
});

describe("round-6 agent-create capacity serialization", () => {
  it("serializes the mobile create path the same way the web path is", () => {
    // Reading the count outside the transaction let concurrent mobile creates
    // all observe the same pre-insert total and every one of them clear the cap.
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
