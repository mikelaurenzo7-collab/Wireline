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

  it("converges the managed Twilio origination route instead of trusting stale console state", () => {
    const provisioning = read("src/lib/voice/xai-sip-provisioning.ts");
    const start = provisioning.indexOf("async function ensureTwilioTrunk");
    const end = provisioning.indexOf("async function attachPhoneToTrunk", start);
    const trunk = provisioning.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    expect(trunk).toContain("originationUrls(primarySid).update");
    expect(trunk).toContain("enabled: true");
    expect(trunk).toContain("friendlyName: XAI_TWILIO_ORIGINATION_FRIENDLY_NAME");
    expect(trunk).toContain("priority: 10");
    expect(trunk).toContain("weight: 10");
    expect(trunk).toContain("sipUrl");
    expect(trunk).toContain("staleManagedOriginations");
    expect(trunk).toContain("originationUrls(staleSid).update");
    expect(trunk).toContain("enabled: false");
    expect(trunk).toContain("Unrelated operator-added");
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
    expect(release).toContain("deactivateNativeXAIPhoneLine");
    expect(release).toContain("releaseTwilioLine");
    expect(release).toContain("releaseLegacyTenantNumber");
    expect(release).toContain('status: "retired"');
    expect(activation).toContain("wireline_claim_xai_phone_deactivation");
    expect(activation).toContain("trunk.phoneNumbers(associationSid).remove()");
    expect(activation).toContain("settleDeactivation");
    expect(activation).toContain("XAI_PHONE_DEACTIVATION_OUTCOME_AMBIGUOUS");
    expect(activation).toContain(
      "attached.find((row) => row.sid === claim.twilioPhoneNumberSid)",
    );
    expect(activation).not.toContain("row.phoneNumberSid");
  });

  it("serializes activation, routing repair, reassignment, and release on one E.164 lease", () => {
    const migration = read("drizzle/migrations/0153_preserve_xai_registration_ledger.sql");
    const activation = read("src/lib/voice/xai-phone-activation-service.ts");
    const provisioning = read("src/lib/voice/xai-sip-provisioning.ts");

    expect(migration.match(/pg_advisory_xact_lock\(hashtext\('xai-phone:'/g)).toHaveLength(2);
    expect(migration).toContain("wireline_claim_xai_phone_deactivation");
    expect(migration).toContain("XAI_PHONE_DEACTIVATING");
    expect(migration).toContain("XAI_PHONE_DEACTIVATION_UNRESOLVED");
    expect(migration).toContain("XAI_PHONE_DEACTIVATION_OUTCOME_AMBIGUOUS");
    expect(migration).toContain("RETURN QUERY SELECT v_binding.id, p_claim_token, false");
    expect(migration).not.toContain("NULL::uuid, true");

    const claim = provisioning.indexOf("const claim = await claimProvisioning");
    const attach = provisioning.indexOf("await attachPhoneToTrunk", claim);
    const xaiRegistration = provisioning.indexOf("await registerPhoneWithXAI", attach);
    const active = provisioning.indexOf('status: "active"', xaiRegistration);
    expect(claim).toBeGreaterThan(-1);
    expect(attach).toBeGreaterThan(claim);
    expect(xaiRegistration).toBeGreaterThan(attach);
    expect(active).toBeGreaterThan(xaiRegistration);

    const deactivationClaim = activation.indexOf("const claim = await claimDeactivation");
    const detach = activation.indexOf("phoneNumbers(associationSid).remove()", deactivationClaim);
    const retired = activation.indexOf('status: "retired"', detach);
    expect(deactivationClaim).toBeGreaterThan(-1);
    expect(detach).toBeGreaterThan(deactivationClaim);
    expect(retired).toBeGreaterThan(detach);
    expect(activation).not.toContain("repairTwilioRouting");
  });

  it("retains one-time xAI secrets outside cascades behind tenant-bound claim functions", () => {
    const schema = read("src/db/xai-voice-schema.ts");
    const baseMigration = read("drizzle/migrations/0152_native_xai_phone_bindings.sql");
    const migration = read("drizzle/migrations/0153_preserve_xai_registration_ledger.sql");
    const provisioning = read("src/lib/voice/xai-sip-provisioning.ts");
    const activation = read("src/lib/voice/xai-phone-activation-service.ts");

    expect(schema).not.toContain(".references(() => users.id");
    expect(schema).not.toContain(".references(() => agents.id");
    expect(baseMigration).toContain("REVOKE ALL ON TABLE public.wireline_xai_phone_bindings");
    expect(baseMigration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS wireline_xai_phone_bindings_user_id_fkey");
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS wireline_xai_phone_bindings_agent_id_fkey");
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("wireline_current_user_id() IS DISTINCT FROM p_user_id");
    expect(migration).toContain("XAI_PHONE_TENANT_MISMATCH");
    expect(migration).toContain("wireline_phone_numbers AS phone");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(migration).toContain("TO wireline_server");
    expect(provisioning).toContain("wireline_claim_xai_phone_binding");
    expect(activation).toContain("wireline_claim_xai_phone_deactivation");

    const tenantCheck = migration.indexOf(
      "public.wireline_current_user_id() IS DISTINCT FROM p_user_id",
    );
    const advisoryLock = migration.indexOf("pg_advisory_xact_lock", tenantCheck);
    const ownershipRow = migration.indexOf("wireline_phone_numbers AS phone", advisoryLock);
    const ownershipLock = migration.indexOf("FOR UPDATE", ownershipRow);
    const retainedBindingLock = migration.indexOf(
      "FROM public.wireline_xai_phone_bindings",
      ownershipLock,
    );

    expect(tenantCheck).toBeGreaterThan(-1);
    expect(advisoryLock).toBeGreaterThan(tenantCheck);
    expect(ownershipRow).toBeGreaterThan(advisoryLock);
    expect(ownershipLock).toBeGreaterThan(ownershipRow);
    expect(retainedBindingLock).toBeGreaterThan(ownershipLock);
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
