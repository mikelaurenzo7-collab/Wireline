import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  agentCapHit,
  agentCapMessage,
  resolveAgentEntitlement,
} from "../src/lib/agent-entitlements";

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
  ])("collapses inactive status %s to the one-draft Free Builder cap", (subscriptionStatus) => {
    const entitlement = resolveAgentEntitlement({
      isOwner: false,
      subscriptionStatus,
      planId: "enterprise",
      maxAgents: 50,
      extraAgents: 25,
    });

    expect(entitlement.subscriptionStatus).toBe(subscriptionStatus || "pending_activation");
    expect(entitlement.planAgents).toBe(1);
    expect(entitlement.purchasedExtras).toBe(0);
    expect(entitlement.effectiveCap).toBe(1);
    expect(entitlement.unlimited).toBe(false);
    expect(agentCapHit(1, entitlement)).toBe(true);
  });

  it("normalizes status before deciding whether paid capacity is valid", () => {
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
    expect(entitlement.planAgents).toBe(2);
    expect(entitlement.purchasedExtras).toBe(1);
    expect(entitlement.effectiveCap).toBe(3);
    expect(inactive.subscriptionStatus).toBe("past_due");
    expect(inactive.effectiveCap).toBe(1);
  });

  it("honors an explicit platform grant only for active or trialing workspaces", () => {
    for (const subscriptionStatus of ["active", "trialing"]) {
      const entitlement = resolveAgentEntitlement({
        isOwner: false,
        subscriptionStatus,
        planId: "team",
        maxAgents: 10,
        extraAgents: 1,
      });
      expect(entitlement.effectiveCap).toBe(10);
    }
  });

  it("keeps the owner workspace unlimited", () => {
    const entitlement = resolveAgentEntitlement({
      isOwner: true,
      subscriptionStatus: "canceled",
      planId: "personal",
      maxAgents: 0,
      extraAgents: 0,
    });

    expect(entitlement.unlimited).toBe(true);
    expect(entitlement.effectiveCap).toBeNull();
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
      "Agent capacity limit reached. Your plan allows up to 1 agent.",
    );
    expect(agentCapMessage(0)).toContain("0 agents");
    expect(agentCapMessage(2)).toContain("2 agents");
    expect(agentCapMessage(25)).toContain("25 agents");

    // Both surfaces raise this, so the sentence has to come from one place or
    // the two copies drift — which is how the pluralisation bug survived.
    for (const file of ["src/routes/agent-routes-v2.ts", "src/lib/agent-draft-service.ts"]) {
      expect(read(file)).toContain("agentCapMessage(entitlement.effectiveCap)");
      expect(read(file)).not.toContain("Your plan allows up to ${entitlement.effectiveCap} agents");
    }
  });
});

describe("carrier teardown integration", () => {
  it("preserves the canonical phone row until strict provider teardown succeeds", () => {
    const source = read("src/lib/phone-provisioning.ts");
    const releaseCall = source.lastIndexOf("const release = await releaseCarrierAllocations(");
    const failureGuard = source.indexOf("if (!release.ok)", releaseCall);
    const localDelete = source.indexOf("tx.delete(schema.phoneNumbers)", releaseCall);

    expect(releaseCall).toBeGreaterThan(-1);
    expect(failureGuard).toBeGreaterThan(releaseCall);
    expect(localDelete).toBeGreaterThan(failureGuard);
    expect(source).toContain("releaseTwilioByE164");
    expect(source).toContain("Carrier number release failed — preserving local ownership row");
  });

  it("makes provisioning compensation strict, truthful, and durable", () => {
    const source = read("src/lib/phone-provisioning.ts");
    const ledger = read("src/lib/orphan-carrier-ledger.ts");
    const retry = read("src/lib/orphan-carrier-retry.ts");

    expect(source).toContain("releaseCarrierOrRecord");
    expect(source).toContain("recordPendingOrphanCarrierResource");
    expect(source).toContain("Carrier compensation queued in durable orphan ledger");
    expect(source).not.toContain("catch(() => undefined)");
    expect(ledger).toContain("INSERT INTO public.wireline_orphan_carrier_resources");
    expect(ledger).toContain("ON CONFLICT (former_user_id, phone_number) WHERE status = 'pending'");
    expect(retry).toContain("number.number === row.phone_number");
    expect(retry).toContain("vapi_number_id = COALESCE(vapi_number_id, ${carrierId})");
  });

  it("reconciles only telecom defaults that referenced the released line", () => {
    const source = read("src/lib/phone-provisioning.ts");
    const localDelete = source.lastIndexOf("tx.delete(schema.phoneNumbers)");
    const vapiGuard = source.indexOf("settingsRow.vapiPhoneNumberId === carrierId", localDelete);
    const smsGuard = source.indexOf("settingsRow.twilioSmsFromNumber === phoneNumber", localDelete);
    const settingsWrite = source.indexOf("tx.update(schema.settings).set(patch)", localDelete);

    expect(localDelete).toBeGreaterThan(-1);
    expect(vapiGuard).toBeGreaterThan(localDelete);
    expect(smsGuard).toBeGreaterThan(vapiGuard);
    expect(settingsWrite).toBeGreaterThan(smsGuard);
    expect(source).toContain("remainingLines.find(");
    expect(source).toContain("isVapiPhoneNumberId(line.vapiNumberId)");
  });

  it("hands a failed provider release to the durable orphan ledger before purge", () => {
    const source = read("src/lib/account-deletion.ts");
    const releaseCall = source.indexOf("releaseTenantNumber(userId, phoneNumber)");
    const failureBranch = source.indexOf("if (res.ok)", releaseCall);
    const orphanInsert = source.indexOf(
      "INSERT INTO public.wireline_orphan_carrier_resources",
      failureBranch,
    );

    expect(releaseCall).toBeGreaterThan(-1);
    expect(failureBranch).toBeGreaterThan(releaseCall);
    expect(orphanInsert).toBeGreaterThan(failureBranch);
  });

  it("protects reassigned numbers and keeps the retry queue fair", () => {
    const retry = read("src/lib/orphan-carrier-retry.ts");
    const ownerCheck = retry.indexOf("hasCurrentCanonicalOwner(row.phone_number)");
    const rediscovery = retry.indexOf("number.number === row.phone_number");
    const providerRelease = retry.indexOf("releaseCarrierAllocations(");

    expect(ownerCheck).toBeGreaterThan(-1);
    expect(rediscovery).toBeGreaterThan(ownerCheck);
    expect(providerRelease).toBeGreaterThan(rediscovery);
    expect(retry).toContain("FROM public.wireline_phone_numbers");
    expect(retry).toContain("Cleanup skipped: phone number has a current canonical owner.");
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
    expect(retry).toContain("WHERE status = 'pending'");
    expect(retry).toContain("SET status = 'resolved', resolved_at = now(), last_error = NULL");
    expect(retry).toContain("SET last_error = ${error}");
    expect(retry).toContain("throw new Error(");
  });

  it("routes user-initiated deletion through strict carrier teardown before the legacy writer", () => {
    const releaseRoute = read("src/routes/phone-number-release-routes.ts");
    const registration = read("src/server/register-api-routes.ts");
    const strictMount = registration.indexOf("app.use(phoneNumberReleaseRouter)");
    const broadMount = registration.indexOf("app.use(carrierRouter)");

    expect(releaseRoute).toContain('router.delete(\n  "/api/phone-numbers/:id"');
    expect(releaseRoute).toContain("releaseTenantNumber(req.user.id, owned.phoneNumber)");
    expect(releaseRoute).toContain("CARRIER_RELEASE_FAILED");
    expect(releaseRoute).toContain("MAX_POSTGRES_BIGINT");
    expect(releaseRoute).toContain("/^\\d{1,19}$/");
    expect(releaseRoute).toContain("parsed > MAX_POSTGRES_BIGINT");
    expect(releaseRoute).not.toContain("delete(schema.phoneNumbers)");
    expect(strictMount).toBeGreaterThan(-1);
    expect(broadMount).toBeGreaterThan(strictMount);
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
