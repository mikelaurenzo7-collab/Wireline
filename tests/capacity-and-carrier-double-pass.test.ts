import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  agentCapHit,
  agentCapMessage,
  resolveAgentEntitlement,
} from "../src/lib/agent-entitlements";
import { BOT_MARK_IDENTITY_CAPACITY } from "../src/lib/bot-mark";
import {
  MAX_EXTRA_AGENT_ADDONS,
  clampAgentCapacity,
  clampExtraAgentAddons,
} from "../src/lib/agent-capacity";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("agent capacity integrity", () => {
  it.each([
    null,
    undefined,
    "pending_activation",
    "past_due",
    "canceled",
    "trial_expired",
    "unknown",
  ])("keeps Bot creation open for inactive status %s", (subscriptionStatus) => {
    const entitlement = resolveAgentEntitlement({
      isOwner: false,
      subscriptionStatus,
      planId: "enterprise",
      maxAgents: 50,
      extraAgents: 25,
    });

    expect(entitlement.subscriptionStatus).toBe(subscriptionStatus || "pending_activation");
    expect(entitlement.planAgents).toBeNull();
    expect(entitlement.purchasedExtras).toBe(0);
    expect(entitlement.effectiveCap).toBeNull();
    expect(entitlement.unlimited).toBe(true);
    expect(agentCapHit(1, entitlement)).toBe(false);
  });

  it("normalizes status without turning it into a Bot cap", () => {
    const entitlement = resolveAgentEntitlement({
      isOwner: false,
      subscriptionStatus: "  ACTIVE  ",
      planId: "team",
      maxAgents: 0,
      extraAgents: 1,
    });
    const inactive = resolveAgentEntitlement({
      isOwner: false,
      subscriptionStatus: "  PAST_DUE  ",
      planId: "enterprise",
      maxAgents: 50,
      extraAgents: 25,
    });

    expect(entitlement.subscriptionStatus).toBe("active");
    expect(entitlement.unlimited).toBe(true);
    expect(entitlement.effectiveCap).toBeNull();
    expect(inactive.subscriptionStatus).toBe("past_due");
    expect(inactive.effectiveCap).toBeNull();
    expect(agentCapHit(25, inactive)).toBe(false);
  });

  it("does not let a stored grant restore a Bot cap", () => {
    for (const subscriptionStatus of ["active", "trialing"]) {
      const entitlement = resolveAgentEntitlement({
        isOwner: false,
        subscriptionStatus,
        planId: "team",
        maxAgents: 10,
        extraAgents: 1,
      });
      expect(entitlement.effectiveCap).toBeNull();
      expect(agentCapHit(10, entitlement)).toBe(false);
    }
  });

  it("keeps the owner workspace unlimited as well", () => {
    const entitlement = resolveAgentEntitlement({
      isOwner: true,
      subscriptionStatus: "canceled",
      planId: "personal",
      maxAgents: 0,
      extraAgents: 0,
    });

    expect(entitlement.unlimited).toBe(true);
    expect(entitlement.subscriptionStatus).toBe("active");
    expect(entitlement.effectiveCap).toBeNull();
    expect(agentCapHit(BOT_MARK_IDENTITY_CAPACITY, entitlement)).toBe(false);
  });

  it("ignores stored counts above the identity namespace", () => {
    const entitlement = resolveAgentEntitlement({
      isOwner: false,
      subscriptionStatus: "active",
      planId: "scale",
      maxAgents: BOT_MARK_IDENTITY_CAPACITY + 50,
      extraAgents: 100,
    });

    expect(entitlement.effectiveCap).toBeNull();
    expect(entitlement.purchasedExtras).toBe(0);
    expect(entitlement.unlimited).toBe(true);
  });

  it("uses one capacity boundary across settings, billing, and Stripe reconciliation", () => {
    expect(clampAgentCapacity(BOT_MARK_IDENTITY_CAPACITY + 1)).toBe(BOT_MARK_IDENTITY_CAPACITY);
    expect(clampExtraAgentAddons(MAX_EXTRA_AGENT_ADDONS + 1)).toBe(MAX_EXTRA_AGENT_ADDONS);

    const settings = read("src/routes/settings-routes.ts");
    const billing = read("src/routes/billing-routes.ts");
    const stripe = read("src/lib/stripe-helpers.ts");
    const atomicBilling = read("src/routes/extra-agent-billing-atomic-routes.ts");

    expect(settings).toContain("clampAgentCapacity");
    expect(settings).toContain("clampExtraAgentAddons");
    expect(settings).toContain("safe.founderUnlimitedAgents = false");
    expect(billing).toContain("resolveAgentEntitlement");
    expect(stripe).toContain("providerExtraAgents > MAX_EXTRA_AGENT_ADDONS");
    expect(stripe).toContain("provider_extra_agents: providerExtraAgents");
    expect(stripe).toContain("clampAgentCapacity(baseMaxAgents + extraAgents)");
    expect(atomicBilling).toContain("target > MAX_EXTRA_AGENT_ADDONS");
  });

  it("serializes Extra Agent billing with every agent-creation surface", () => {
    const billing = read("src/routes/extra-agent-billing-atomic-routes.ts");
    expect(billing).toContain("hashtext(${req.user.id})");
    expect(billing).not.toContain("billing-extra-agents:");

    expect(read("src/routes/agent-routes-v2.ts")).toContain("hashtext(${req.user.id})");
    expect(read("src/routes/mobile-routes.ts")).toContain("hashtext(${req.user.id})");
    expect(read("src/lib/agent-draft-service.ts")).toContain("hashtext(${principal.userId})");
  });

  it("counts agents in the cap message the way the rest of the product does", () => {
    // Every free workspace has a cap of 1, so the singular is the wording most
    // people actually see — and it read "up to 1 agents" while the rest of the
    // product pluralises counts.
    expect(agentCapMessage(1)).toBe(
      "Your plan includes 1 Bot. Change your current Bot in its Workspace to give it a new job.",
    );
    expect(agentCapMessage(0)).toContain("0 Bots");
    expect(agentCapMessage(2)).toContain("2 Bots");
    expect(agentCapMessage(25)).toContain("25 Bots");

    // Both surfaces raise this, so the sentence has to come from one place or
    // the two copies drift — which is how the pluralisation bug survived. Its
    // own code keeps the client from showing a payment prompt no plan answers.
    for (const file of ["src/routes/agent-routes-v2.ts", "src/lib/agent-draft-service.ts"]) {
      expect(read(file)).toContain(
        "agentCapMessage(entitlement.effectiveCap, entitlement.unlimited)",
      );
      expect(read(file)).toContain("AGENT_CAPACITY_REACHED");
      expect(read(file)).not.toContain("Your plan allows up to ${entitlement.effectiveCap} agents");
    }
    const modal = read("src/components/TrialGateModal.tsx");
    expect(modal).toContain('detail.code !== "AGENT_CAPACITY_REACHED"');
    expect(modal).toContain('case "AGENT_CAPACITY_REACHED":');
  });
});

describe("carrier teardown integration", () => {
  it("preserves the canonical phone row until strict provider teardown succeeds", () => {
    const source = read("src/lib/voice/native-phone-release.ts");
    const releaseCall = source.indexOf("await releaseTwilioLine(carrierId)");
    const failureGuard = source.indexOf("catch (error)", releaseCall);
    const localDelete = source.indexOf(".delete(schema.phoneNumbers)", failureGuard);

    expect(releaseCall).toBeGreaterThan(-1);
    expect(failureGuard).toBeGreaterThan(releaseCall);
    expect(localDelete).toBeGreaterThan(failureGuard);
    expect(source).toContain("resolveOwnedTwilioNumberSid");
    expect(source).toContain("The carrier could not confirm release");
  });

  it("makes provisioning compensation strict, truthful, and durable", () => {
    const source = read("src/lib/voice/native-phone-provisioning.ts");
    const ledger = read("src/lib/orphan-carrier-ledger.ts");
    const retry = read("src/lib/orphan-carrier-retry.ts");

    expect(source).toContain("releasePurchasedNativeNumber");
    expect(source).toContain("released or queued for cleanup");
    expect(source).not.toContain("catch(() => undefined)");
    expect(ledger).toContain("INSERT INTO public.wireline_orphan_carrier_resources");
    expect(ledger).toContain("ON CONFLICT (former_user_id, phone_number) WHERE status = 'pending'");
    expect(retry).toContain("discoverTwilioNumberIdByE164");
    expect(retry).toContain("releaseCarrierAllocations(");
  });

  it("reconciles only telecom defaults that referenced the released line", () => {
    const source = read("src/lib/voice/native-phone-release.ts");
    const localDelete = source.indexOf(".delete(schema.phoneNumbers)");
    const smsGuard = source.indexOf("settings?.twilioSmsFromNumber === phoneNumber", localDelete);
    const settingsWrite = source.indexOf(".update(schema.settings)", smsGuard);

    expect(localDelete).toBeGreaterThan(-1);
    expect(smsGuard).toBeGreaterThan(localDelete);
    expect(settingsWrite).toBeGreaterThan(smsGuard);
    expect(source).toContain("replacement?.phoneNumber ?? null");
  });

  it("hands a failed provider release to the durable orphan ledger before purge", () => {
    const source = read("src/lib/account-deletion.ts");
    const releaseCall = source.indexOf("releaseNativeTenantNumber(userId, phoneNumber, {");
    const failureBranch = source.indexOf("if (res.ok)", releaseCall);
    const orphanInsert = source.indexOf(
      "INSERT INTO public.wireline_orphan_carrier_resources",
      failureBranch,
    );

    expect(releaseCall).toBeGreaterThan(-1);
    expect(source.slice(releaseCall, releaseCall + 180)).toContain("terminalCleanup: true");
    expect(failureBranch).toBeGreaterThan(releaseCall);
    expect(orphanInsert).toBeGreaterThan(failureBranch);
  });

  it("protects reassigned numbers and keeps the retry queue fair", () => {
    const retry = read("src/lib/orphan-carrier-retry.ts");
    const ownerCheck = retry.indexOf("hasCurrentCanonicalOwner(row.phone_number)");
    const rediscovery = retry.indexOf("discoverTwilioNumberIdByE164(row.phone_number)");
    const providerRelease = retry.indexOf("releaseCarrierAllocations(");

    expect(ownerCheck).toBeGreaterThan(-1);
    expect(rediscovery).toBeGreaterThan(ownerCheck);
    expect(providerRelease).toBeGreaterThan(rediscovery);
    expect(retry).toContain("FROM public.wireline_phone_numbers");
    expect(retry).toMatch(
      /hasCurrentCanonicalOwner\(row\.phone_number\)[\s\S]*DELETE FROM public\.wireline_orphan_carrier_resources/,
    );
    expect(retry).toContain("created_at = now()");
  });

  it("consumes pending ledger rows through the existing daily integrity janitor", () => {
    const worker = read("src/lib/job-worker.ts");
    const retry = read("src/lib/orphan-carrier-retry.ts");
    const tenantIsolatedIntercept = worker.indexOf('job.type === "proactive_lead_enrichment"');
    const janitorIntercept = worker.indexOf('job.type === "sweep_orphan_supervisor_subs"');
    const finalBaseDispatch = worker.lastIndexOf("await handleBaseJob(job as never)");

    expect(tenantIsolatedIntercept).toBeGreaterThan(-1);
    expect(janitorIntercept).toBeGreaterThan(tenantIsolatedIntercept);
    expect(finalBaseDispatch).toBeGreaterThan(janitorIntercept);
    expect(worker).toContain("retryPendingOrphanCarrierResources()");
    expect(retry).toContain("orphan.status = 'pending'");
    expect(retry).toContain("wireline_account_operation_leases AS lease");
    expect(retry).toContain("lease.expires_at > now()");
    expect(retry).toContain("NATIVE_TWILIO_PURCHASE_CLAIM_JANITOR_DELAY_MS");
    expect(
      retry.match(/DELETE FROM public\.wireline_orphan_carrier_resources/g)?.length,
    ).toBeGreaterThanOrEqual(2);
    expect(retry).toContain("SET last_error = ${error}");
    expect(retry).toContain("throw new Error(");
  });

  it("routes user-initiated deletion through strict carrier teardown before the legacy writer", () => {
    const releaseRoute = read("src/routes/native-phone-routing-routes.ts");
    const registration = read("src/server/register-api-routes.ts");
    const strictMount = registration.indexOf("app.use(nativePhoneRoutingRouter)");

    expect(releaseRoute).toContain('router.delete(\n  "/api/phone-numbers/:id"');
    expect(releaseRoute).toContain("releaseNativeTenantNumber(req.user.id, owned.phoneNumber)");
    expect(releaseRoute).toContain("CARRIER_RELEASE_FAILED");
    expect(releaseRoute).toContain("MAX_POSTGRES_BIGINT");
    expect(releaseRoute).toContain("/^\\d{1,19}$/");
    expect(releaseRoute).toContain("parsed > MAX_POSTGRES_BIGINT");
    expect(releaseRoute).not.toContain("delete(schema.phoneNumbers)");
    expect(strictMount).toBeGreaterThan(-1);
  });
});

describe("runtime artifact settlement integrity", () => {
  it("checkpoints paid provider results inside the refundable reservation", () => {
    const worker = read("src/lib/job-worker.ts");
    const postStart = worker.indexOf("async function handlePostCallArtifact");
    const scheduledStart = worker.indexOf("async function handleScheduledReport");
    const postBlock = worker.slice(postStart, scheduledStart);
    const scheduledBlock = worker.slice(
      scheduledStart,
      worker.indexOf("/** Global durable-job dispatcher"),
    );

    expect(postBlock).toContain("await withRuntimeReservation(job, userId, format, async () => {");
    expect(postBlock.indexOf("generateAndStorePostCallArtifact")).toBeLessThan(
      postBlock.indexOf("await persistJobResult"),
    );
    const scheduledReservation = scheduledBlock.slice(
      scheduledBlock.indexOf("await withRuntimeReservation("),
    );
    expect(scheduledReservation).toContain("async () => {");
    expect(scheduledReservation.indexOf("generateScheduledOperatingReport")).toBeLessThan(
      scheduledReservation.indexOf("await persistJobResult"),
    );
    expect(worker).toContain("One reserve follows the durable job across retries");
    expect(worker).toContain("attemptNumber(job) >= maxAttemptNumber(job)");
  });
});
