import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n/g, "\n");

/**
 * Contract: three defects found in the final vigilant e2e bug hunt.
 *
 * 1. Intake auto-dial reached the paid voice provider without the shared
 *    wallet/quota/spend gate every other outbound path enforces — a depleted
 *    tenant with auto-dial intake keys could keep dialing and accrue unbounded
 *    completion-grace debt.
 * 2. GET /api/quotas/plans is a public (no-session) route but was mounted on
 *    the per-user quotaRateLimit, whose createRateLimiter throws unauthorized()
 *    when req.user is absent — so the public plan table 401'd for everyone.
 * 3. Account deletion purged the DB rows but never told Stripe or the carrier:
 *    the Stripe subscription kept billing a customer whose account no longer
 *    existed, and provisioned Twilio/Vapi numbers stayed rented with no owner.
 */
describe("final e2e bugfix contracts", () => {
  it("intake auto-dial passes the shared outbound voice spend/quota gate", () => {
    const intake = read("src/routes/intake-routes.ts");
    expect(intake).toContain(
      'import { assertOutboundVoiceAllowed } from "../lib/voice-spend-control"',
    );
    // The guard must run BEFORE placeOutboundCall, not after.
    const guardAt = intake.indexOf("assertOutboundVoiceAllowed({");
    const dialAt = intake.indexOf("placeOutboundCall({");
    expect(guardAt).toBeGreaterThan(-1);
    expect(dialAt).toBeGreaterThan(-1);
    expect(guardAt).toBeLessThan(dialAt);
    // A blocked tenant marks the lead rather than dialing.
    expect(intake).toContain("voice_spend_blocked");
  });

  it("public plans route uses an IP limiter, not the auth-only per-user limiter", () => {
    const quotas = read("src/routes/quota-routes.ts");
    expect(quotas).toContain("createIpRateLimiter");
    expect(quotas).toContain('bucket: "api:quotas:plans"');
    // The /plans handler must carry the public IP limiter and must NOT reuse the
    // per-user quotaRateLimit that throws unauthorized() without a session.
    const plansLine = quotas.split("\n").find((l) => l.includes('router.get("/plans"'));
    expect(plansLine).toBeTruthy();
    expect(plansLine).toContain("plansPublicRateLimit");
    expect(plansLine).not.toContain("quotaRateLimit");
  });

  it("account purge cancels Stripe subscriptions and releases carrier numbers first", () => {
    const deletion = read("src/lib/account-deletion.ts");
    expect(deletion).toContain("export async function releaseExternalResourcesForPurge");
    expect(deletion).toContain("stripe.subscriptions.cancel");
    expect(deletion).toContain("stripe.subscriptions.list");
    expect(deletion).toContain("releaseTenantNumber");
    // Already-canceled subscriptions are treated as success; other Stripe
    // errors throw so the job retries instead of orphaning a live subscription.
    expect(deletion).toContain("isStripeAlreadyGone");
    const catchIdx = deletion.indexOf(
      "catch (err) {",
      deletion.indexOf("stripe.subscriptions.cancel"),
    );
    const throwIdx = deletion.indexOf("throw err;", catchIdx);
    expect(catchIdx).toBeGreaterThan(-1);
    expect(throwIdx).toBeGreaterThan(catchIdx);
  });

  it("the purge job releases external resources before the irreversible row purge", () => {
    const worker = read("src/lib/job-worker-base.ts");
    expect(worker).toContain("releaseExternalResourcesForPurge");
    const releaseAt = worker.indexOf("releaseExternalResourcesForPurge(p.user_id");
    const purgeAt = worker.indexOf("purgeAccount(p.user_id");
    expect(releaseAt).toBeGreaterThan(-1);
    expect(purgeAt).toBeGreaterThan(-1);
    expect(releaseAt).toBeLessThan(purgeAt);
  });

  // ── Second-wave findings from the parallel deep-dive bug hunt ──────────────

  it("outbound end-of-call finalization clears the dialing placeholder marker", () => {
    const handlers = read("src/lib/vapi-handlers.ts");
    // The placeholder-finalization UPDATE must null pipelineError so a duplicate
    // Vapi retry no longer matches isOutboundCallPlaceholder() and falls to the
    // side-effect-free duplicate-ignore branch (no double metering / webhook /
    // TCPA ledger row).
    const finalizeAt = handlers.indexOf("isOutboundCallPlaceholder(existing)");
    expect(finalizeAt).toBeGreaterThan(-1);
    // Bound the window by the block's own closing check rather than a byte
    // count, so adding a line to the UPDATE cannot push the invariant out of
    // view and turn a passing contract into a false failure.
    const finalizeEnd = handlers.indexOf("if (finalized.length)", finalizeAt);
    expect(finalizeEnd).toBeGreaterThan(finalizeAt);
    const finalizeBlock = handlers.slice(finalizeAt, finalizeEnd);
    expect(finalizeBlock).toContain("pipelineError: null");
  });

  it("cadence tick atomically claims a run before running the side-effecting step", () => {
    const cadence = read("src/lib/cadence-engine.ts");
    // Lease-based claim (not a null-claim) so a mid-step crash self-heals.
    expect(cadence).toContain("CADENCE_STEP_LEASE_MS");
    const claimAt = cadence.indexOf(".update(schema.cadenceRuns)");
    const executeAt = cadence.indexOf("await executeStep(");
    expect(claimAt).toBeGreaterThan(-1);
    expect(executeAt).toBeGreaterThan(-1);
    // The claim + `if (!claimed.length) continue;` must precede executeStep.
    expect(cadence).toContain("if (!claimed.length) continue;");
    expect(cadence.indexOf("if (!claimed.length) continue;")).toBeLessThan(executeAt);
  });

  it("charge.refunded fallback keys each refund on its own id, not the cumulative charge total", () => {
    const billing = read("src/routes/billing-routes.ts");
    // When the event omits the inline refunds list, the handler must fetch them
    // and reverse each keyed on refund.id — reversing the cumulative
    // amount_refunded under charge.id drops every partial refund after the first.
    const fallbackAt = billing.indexOf("The event omitted the inline refunds list");
    expect(fallbackAt).toBeGreaterThan(-1);
    const fallbackBlock = billing.slice(fallbackAt, fallbackAt + 3200);
    expect(fallbackBlock).toContain("stripe.refunds");
    expect(fallbackBlock).toContain("providerObjectId: refund.id");
    // An empty list is not licence to reverse the cumulative total under
    // charge.id. That fired whenever a refund was accepted but unsettled, and
    // the later charge.refunded redelivery reversed the same money again under
    // refund.id — disjoint keys, so the (user, ref) index dedupes neither.
    expect(fallbackBlock).toContain("reports refunded funds but no succeeded refund objects.");
    expect(fallbackBlock).not.toContain("providerObjectId: charge.id");
  });

  it("password-reset, resend-verification, and migrate-session limiters fail closed without a distributed limiter", () => {
    const mw = read("src/middleware/rate-limit-middleware.ts");
    for (const fn of [
      "resetPasswordRateLimiter",
      "resendVerificationRateLimiter",
      "migrateSessionRateLimiter",
    ]) {
      const at = mw.indexOf(`export async function ${fn}`);
      expect(at).toBeGreaterThan(-1);
      const body = mw.slice(at, at + 900);
      expect(body).toContain("refusedForNoDistributedLimiter(res)");
      expect(body).toContain("authRateLimitOptions(");
    }
  });
});
