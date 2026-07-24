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
});
