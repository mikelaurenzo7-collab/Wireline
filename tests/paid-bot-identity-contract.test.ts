import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("paid Bot identity reconciliation", () => {
  const identity = read("src/lib/paid-bot-identity.ts");
  const phone = read("src/lib/phone-provisioning.ts");
  const mail = read("src/lib/agentmail-mail.ts");
  const ops = read("scripts/reconcile-paid-bot-identities.mts");
  const pricing = read("src/lib/plan-catalog.ts");

  it("allocates identity only for active or trialing paid catalog plans", () => {
    expect(identity).toContain('const PAID_IDENTITY_STATUSES = new Set(["active", "trialing"])');
    expect(identity).toContain("plan.price_usd_monthly > 0");
    expect(identity).toContain("plan.included_phone_numbers > 0");
    expect(identity).toContain("if (!plan.eligible)");
    expect(pricing).toContain('id: "personal"');
    expect(pricing).toContain('included_phone_numbers: 0');
  });

  it("requires every accepted paid-Bot line to be owned by the configured Twilio account", () => {
    expect(identity).toContain("getTwilioClient()");
    expect(identity).toContain("incomingPhoneNumbers.list({ phoneNumber, limit: 1 })");
    expect(identity).toContain("Paid Bot line is not owned by the configured Twilio account");
    expect(identity).toContain("releaseTenantNumber(userId, provisioned.phoneNumber)");
    expect(phone).toContain("provisionTenantNumber");
  });

  it("requires a managed custom AgentMail domain instead of provider-branded fallback", () => {
    expect(identity).toContain("AGENTMAIL_DEFAULT_DOMAIN");
    expect(identity).toContain("AGENTMAIL_API_KEY");
    expect(identity).toContain("createAgentMailInbox");
    expect(identity).toContain("domain,");
    expect(identity).toContain('platform: "BotBound"');
    expect(identity).toContain("AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL");
    expect(mail).toContain('AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL = "botbound-managed-agentmail-v1"');
  });

  it("reuses existing provider resources before attempting another allocation", () => {
    expect(identity).toContain("if (existing?.oauthGrantedScopes?.includes(MANAGED_SCOPE_MARKER))");
    expect(identity).toContain("listAgentMailInboxes(input.apiKey)");
    expect(identity).toContain("if (existing) return { ...existing, reused: true }");
    expect(phone).toContain("alreadyAssigned");
    expect(phone).toContain("reused: true");
  });

  it("keeps the live backfill operator-controlled and dry-run by default", () => {
    expect(ops).toContain('const APPLY = process.argv.includes("--apply")');
    expect(ops).toContain('mode: APPLY ? "apply" : "dry-run"');
    expect(ops).toContain("if (!APPLY)");
    expect(ops).toContain("Re-run with --apply only after Twilio and the verified AgentMail custom domain are production-ready");
    expect(ops).toContain("ensurePaidBotIdentity");
  });

  it("does not claim automatic activation until the reconciler is attached to a durable trigger", () => {
    const worker = read("src/lib/job-worker.ts");
    const createRoute = read("src/routes/agent-routes-v2.ts");
    const checkout = read("src/lib/stripe-checkout-fulfillment.ts");
    const wired = [worker, createRoute, checkout].some((source) => source.includes("ensurePaidBotIdentity"));
    // Flip this contract only when create/checkout enqueue and the durable worker executes the job.
    expect(wired).toBe(false);
  });
});
