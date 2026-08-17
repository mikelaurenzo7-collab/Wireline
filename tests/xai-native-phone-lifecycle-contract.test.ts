import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("native Twilio + xAI phone lifecycle", () => {
  it("gives native self-serve phone routes precedence over rollback carrier routes", () => {
    const registry = read("src/server/register-api-routes.ts");

    expect(registry.indexOf("app.use(nativePhoneRoutingRouter)")).toBeLessThan(
      registry.indexOf("app.use(carrierRouter)"),
    );
    expect(registry.indexOf("app.use(nativePhoneReleaseRouter)")).toBeLessThan(
      registry.indexOf("app.use(phoneNumberReleaseRouter)"),
    );
  });

  it("keeps active allocation Twilio-owned and activates xAI without Vapi fallback", () => {
    const carrier = read("src/lib/voice/native-phone-carrier.ts");
    const provisioning = read("src/lib/voice/native-phone-provisioning.ts");
    const routes = read("src/routes/native-phone-routing-routes.ts");

    expect(carrier).toContain("client.availablePhoneNumbers(\"US\").local.list");
    expect(carrier).toContain("client.incomingPhoneNumbers.create");
    expect(carrier).toContain("recoverAcceptedPurchase");
    expect(carrier).toContain("isAmbiguousTwilioPhoneMutationError");
    expect(carrier).not.toContain("VAPI_PRIVATE_KEY");
    expect(carrier).not.toContain("api.vapi.ai");
    expect(provisioning).toContain("provisionNativeXAIPhone");
    expect(provisioning).not.toContain("VAPI_PRIVATE_KEY");
    expect(routes).toContain('provider: "twilio_xai_native"');
  });

  it("compensates failed purchases and preserves ambiguous outcomes for cleanup", () => {
    const carrier = read("src/lib/voice/native-phone-carrier.ts");
    const ledger = read("src/lib/orphan-carrier-ledger.ts");
    const retry = read("src/lib/orphan-carrier-retry.ts");

    expect(carrier).toContain("releasePurchasedNativeNumber");
    expect(carrier).toContain("recordPendingOrphanCarrierResource");
    expect(ledger).toContain('NATIVE_TWILIO_E164_ORPHAN_MARKER = "twilio:e164"');
    expect(ledger).toContain('error.startsWith("Ambiguous native Twilio purchase:")');
    expect(retry).toContain('row.vapiNumberId === "twilio:e164"');
    expect(retry).toContain("discoverTwilioNumberIdByE164");
  });

  it("makes assignment and release reversible across provider and database failures", () => {
    const assignment = read("src/lib/voice/native-phone-assignment.ts");
    const release = read("src/lib/voice/native-phone-release.ts");
    const activation = read("src/lib/voice/xai-phone-activation-service.ts");

    expect(assignment).toContain("deactivateNativeXAIPhoneLine");
    expect(assignment).toContain("restorePreviousRouting");
    expect(assignment).toContain("currentAgentPredicate");
    expect(assignment).toContain("Native phone assignment database rollback failed");
    expect(release).toContain("releaseTwilioLine");
    expect(release).toContain("releaseLegacyTenantNumber");
    expect(release).toContain('status: "retired"');
    expect(activation).toContain("trunk.phoneNumbers(associationSid).remove()");
  });

  it("retains one-time xAI secrets outside tenant and agent cascades", () => {
    const schema = read("src/db/xai-voice-schema.ts");
    const migration = read("drizzle/migrations/0153_preserve_xai_registration_ledger.sql");
    const provisioning = read("src/lib/voice/xai-sip-provisioning.ts");

    expect(schema).not.toContain(".references(() => users.id");
    expect(schema).not.toContain(".references(() => agents.id");
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS wireline_xai_phone_bindings_user_id_fkey");
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS wireline_xai_phone_bindings_agent_id_fkey");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = pg_catalog, public, pg_temp");
    expect(migration).toContain("wireline_phone_numbers AS phone");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("v_binding.status <> 'retired'");
    expect(migration).toContain("TO wireline_server");
    expect(provisioning).toContain("wireline_claim_xai_phone_binding");
  });

  it("journals and materializes the retained-registration migration", () => {
    const journal = read("drizzle/migrations/meta/_journal.json");
    const materializer = read("scripts/materialize-drizzle-meta.mjs");

    expect(journal).toContain('"tag": "0153_preserve_xai_registration_ledger"');
    expect(materializer).toContain("TARGET_0051_PATH");
    expect(materializer).toContain("buildPreservedRegistrationSnapshot");
    expect(materializer).toContain("snapshot.tables[TABLE_NAME].foreignKeys = {}");
  });
});
