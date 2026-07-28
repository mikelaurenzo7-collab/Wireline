import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { agentCapHit, resolveAgentEntitlement } from "../src/lib/agent-entitlements";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("agent capacity integrity", () => {
  it.each([null, undefined, "pending_activation", "past_due", "canceled", "trial_expired", "unknown"])(
    "collapses inactive status %s to the one-draft Free Builder cap",
    (subscriptionStatus) => {
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
    },
  );

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
});

describe("carrier teardown integration", () => {
  it("preserves the canonical phone row until strict provider teardown succeeds", () => {
    const source = read("src/lib/phone-provisioning.ts");
    const releaseCall = source.indexOf("const release = await releaseCarrierAllocations(");
    const failureGuard = source.indexOf("if (!release.ok)", releaseCall);
    const localDelete = source.indexOf("tx.delete(schema.phoneNumbers)", releaseCall);

    expect(releaseCall).toBeGreaterThan(-1);
    expect(failureGuard).toBeGreaterThan(releaseCall);
    expect(localDelete).toBeGreaterThan(failureGuard);
    expect(source).toContain("releaseTwilioByE164");
    expect(source).toContain("Carrier number release failed — preserving local ownership row");
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

  it("consumes pending ledger rows through the existing daily integrity janitor", () => {
    const worker = read("src/lib/job-worker.ts");
    const retry = read("src/lib/orphan-carrier-retry.ts");

    expect(worker).toContain('job.type === "sweep_orphan_supervisor_subs"');
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
    expect(releaseRoute).not.toContain("delete(schema.phoneNumbers)");
    expect(strictMount).toBeGreaterThan(-1);
    expect(broadMount).toBeGreaterThan(strictMount);
  });
});
