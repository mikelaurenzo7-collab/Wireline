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

    expect(carrier).toContain('client.availablePhoneNumbers("US").local.list');
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
    expect(carrier).toContain("createPendingNativeTwilioPurchaseClaim");
    expect(carrier).toContain("retainNativeTwilioPurchaseClaim");
    expect(carrier.indexOf("createPendingNativeTwilioPurchaseClaim")).toBeLessThan(
      carrier.indexOf("incomingPhoneNumbers.create"),
    );
    expect(ledger).toContain('NATIVE_TWILIO_E164_ORPHAN_MARKER = "twilio:e164"');
    expect(ledger).toContain('NATIVE_TWILIO_PURCHASE_CLAIM_MARKER_PREFIX = "twilio:purchase:"');
    expect(ledger).toContain("nativeTwilioPurchaseFriendlyName");
    expect(retry).toContain('row.vapiNumberId === "twilio:e164"');
    expect(retry).toContain("discoverTwilioNumberIdByE164");
    expect(retry).toContain("discoverTwilioPurchaseClaimSid");
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
    expect(release).toContain("wireline_retire_xai_phone_binding");
    expect(activation).toContain("wireline_claim_xai_phone_deactivation");
    expect(activation).toContain("trunk.phoneNumbers(associationSid).remove()");
    expect(activation).toContain("settleDeactivation");
    expect(activation).toContain("XAI_PHONE_DEACTIVATION_OUTCOME_AMBIGUOUS");
    expect(activation).toContain("attached.find((row) => row.sid === claim.twilioPhoneNumberSid)");
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
    const retired = activation.indexOf("await retireDeactivation", detach);
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
    expect(migration).toContain(
      "DROP CONSTRAINT IF EXISTS wireline_xai_phone_bindings_user_id_fkey",
    );
    expect(migration).toContain(
      "DROP CONSTRAINT IF EXISTS wireline_xai_phone_bindings_agent_id_fkey",
    );
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

  it("de-identifies retired, erased-owner, and deleted-agent registration ledgers", () => {
    const schema = read("src/db/xai-voice-schema.ts");
    const migration = read("drizzle/migrations/0159_deidentify_retired_xai_bindings.sql");
    const activation = read("src/lib/voice/xai-phone-activation-service.ts");
    const release = read("src/lib/voice/native-phone-release.ts");
    const deletion = read("src/lib/account-deletion.ts");

    expect(schema).toContain("wireline_xai_binding_owner_identity");
    expect(migration).toContain("user_id = binding.id");
    expect(migration).toContain("agent_id = 'retired:' || binding.id::text");
    expect(migration).toContain("FROM public.wireline_users AS live_user");
    expect(migration).toContain("FROM public.wireline_agents AS live_agent");
    expect(migration).toContain("user_id IS DISTINCT FROM id");
    expect(migration).toContain("wireline_retire_xai_phone_binding");
    expect(migration).toContain("wireline_scrub_xai_phone_bindings_for_purge");
    expect(migration).toContain("status = 'purging'");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated, service_role");
    expect(activation).toContain("wireline_retire_xai_phone_binding");
    expect(release).toContain("wireline_retire_xai_phone_binding");
    expect(deletion).toContain("wireline_scrub_xai_phone_bindings_for_purge");
    const tenantRelease = deletion.indexOf(".run(userId, () =>");
    const carrierRelease = deletion.indexOf("releaseNativeTenantNumber", tenantRelease);
    expect(tenantRelease).toBeGreaterThan(-1);
    expect(carrierRelease).toBeGreaterThan(tenantRelease);
  });

  it("retains stale incomplete xAI registration claims as ambiguous after owner teardown", () => {
    const migration = read("drizzle/migrations/0159_deidentify_retired_xai_bindings.sql");
    const activation = read("src/lib/voice/xai-phone-activation-service.ts");
    const claimStart = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.wireline_claim_xai_phone_deactivation",
    );
    const claimEnd = migration.indexOf(
      "CREATE OR REPLACE FUNCTION public.wireline_retire_xai_phone_binding",
      claimStart,
    );
    const claim = migration.slice(claimStart, claimEnd);

    expect(claimStart).toBeGreaterThan(-1);
    expect(claimEnd).toBeGreaterThan(claimStart);
    expect(claim).toContain("v_binding.status = 'provisioning'");
    expect(claim).toContain("v_binding.provisioning_claimed_at > v_now - interval '10 minutes'");
    expect(claim).toContain("v_binding.xai_phone_number_id IS NULL");
    expect(claim).toContain("v_binding.xai_webhook_id IS NULL");
    expect(claim).toContain("v_binding.webhook_secret_encrypted IS NULL");
    expect(claim).toContain("THEN 'XAI_PHONE_REGISTRATION_OUTCOME_AMBIGUOUS'");
    expect(claim.indexOf("XAI_PHONE_ALREADY_PROVISIONING")).toBeLessThan(
      claim.indexOf("v_prior_last_error := CASE"),
    );
    expect(activation).toContain("retainedXAIRegistrationError(claim.priorLastError)");
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
