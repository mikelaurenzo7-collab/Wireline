import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("paid Bot identity reconciliation", () => {
  const identity = read("src/lib/paid-bot-identity.ts");
  const phone = read("src/lib/voice/native-phone-provisioning.ts");
  const mail = read("src/lib/agentmail-mail.ts");
  const ops = read("scripts/reconcile-paid-bot-identities.mts");
  const endpoint = read("api/reconcile-paid-bot-identities.ts");
  const pricing = read("src/lib/plan-catalog.ts");

  it("allocates identity only after a paid subscription becomes active", () => {
    expect(identity).toContain('const PAID_IDENTITY_STATUSES = new Set(["active"])');
    expect(identity).not.toContain('new Set(["active", "trialing"])');
    expect(identity).toContain("plan.price_usd_monthly > 0");
    expect(identity).toContain("plan.included_phone_numbers > 0");
    expect(identity).toContain("if (!plan.eligible)");
    expect(pricing).toContain('id: "personal"');
    expect(pricing).toContain("included_phone_numbers: 0");
  });

  it("requires every accepted paid-Bot line to be owned by the configured Twilio account", () => {
    expect(identity).toContain("getTwilioClient()");
    expect(identity).toContain("incomingPhoneNumbers.list({ phoneNumber, limit: 1 })");
    expect(identity).toContain("Paid Bot line is not owned by the configured Twilio account");
    expect(identity).toContain("releaseTenantNumber(userId, provisioned.phoneNumber)");
    expect(identity).toContain("provisionTenantNumber(userId");
    expect(phone).toContain("export async function provisionNativeTenantNumber");
  });

  it("holds the tenant deletion fence across paid identity provider work", () => {
    const fenceIndex = identity.indexOf("runTenantProviderWorkWithDeletionFence({");
    const phoneIndex = identity.indexOf("await ensurePaidBotPhone", fenceIndex);
    const mailIndex = identity.indexOf("await ensurePaidBotMailbox", fenceIndex);

    expect(fenceIndex).toBeGreaterThanOrEqual(0);
    expect(identity).toContain('operation: "paid_bot_identity_reconcile"');
    expect(mailIndex).toBeGreaterThan(fenceIndex);
    expect(phoneIndex).toBeGreaterThan(mailIndex);
    expect(identity).toContain("if (!fenced.performed)");
    expect(identity).toContain("account deletion is in progress");
  });

  it("requires a managed custom AgentMail domain instead of provider-branded fallback", () => {
    expect(identity).toContain("AGENTMAIL_DEFAULT_DOMAIN");
    expect(identity).toContain("AGENTMAIL_API_KEY");
    expect(identity).toContain("createAgentMailInbox");
    expect(identity).toContain("domain,");
    expect(identity).toContain('platform: "BotBound"');
    expect(identity).toContain("must be botbound.me or a BotBound subdomain");
    expect(identity).toContain("Existing managed mailbox is not on the configured BotBound domain");
    expect(identity).toContain("AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL");
    expect(mail).toContain(
      'AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL = "botbound-managed-agentmail-v1"',
    );
  });

  it("creates the mailbox before any carrier spend", () => {
    const fencedIndex = identity.indexOf("runTenantProviderWorkWithDeletionFence({");
    const emailIndex = identity.indexOf("await ensurePaidBotMailbox", fencedIndex);
    const phoneIndex = identity.indexOf("await ensurePaidBotPhone", fencedIndex);

    expect(identity).not.toContain("AGENTMAIL_MANAGED_INBOX_CAPACITY");
    expect(emailIndex).toBeGreaterThan(fencedIndex);
    expect(phoneIndex).toBeGreaterThan(emailIndex);
  });

  it("documents the production-owned AgentMail credential and BotBound domain", () => {
    const env = read(".env.example");
    expect(env).toContain("AGENTMAIL_API_KEY=");
    expect(env).toContain("AGENTMAIL_DEFAULT_DOMAIN=");
    expect(env).toContain("production-only platform credential");
    expect(env).not.toContain("do not set a shared AGENTMAIL_API_KEY");
  });

  it("reuses existing provider resources while reconciling missing delivery state", () => {
    expect(identity).toContain("hasExactAgentMailManagedScope(account.oauthGrantedScopes)");
    expect(identity).toContain("refreshToken: schema.emailAccounts.refreshToken");
    expect(identity).toContain("hasStoredSecret: Boolean(existing.refreshToken)");
    expect(identity).toContain("ensureManagedDeliveryWebhook");
    expect(identity).toContain("emailAddress: existing.emailAddress");
    expect(identity).toContain("AgentMail webhook registration requires a public APP_URL");
    expect(identity).toContain("if (!ensured.secret && input.hasStoredSecret) return");
    expect(identity).toContain("listAgentMailInboxes(input.apiKey)");
    expect(identity).toContain("if (existing) return { ...existing, reused: true }");
    expect(identity).toContain("reused: Boolean(provisioned.reused)");
    expect(identity).toContain("phoneReused: phone.reused");
  });

  it("reserves the exact managed address before any provider mailbox creation", () => {
    const reserveIndex = identity.indexOf("const connected = await upsertOwnedEmailAccount");
    const providerIndex = identity.indexOf("const inbox = await resolveManagedInbox", reserveIndex);
    expect(reserveIndex).toBeGreaterThanOrEqual(0);
    expect(providerIndex).toBeGreaterThan(reserveIndex);
    expect(identity).toContain("emailAddress: reservedEmailAddress");
    expect(identity).toContain("AgentMail did not create the exact reserved BotBound mailbox");
  });

  it("narrows ImapFlow search results before using array-only operations", () => {
    expect(mail).toContain("if (!Array.isArray(uids) || uids.length === 0) return []");
    expect(mail).toContain("const recentUids = uids.slice(-limit).reverse()");
  });

  it("pages the protected HTTP reconciler so bounded batches can reach every paid Bot", () => {
    expect(endpoint).toContain('searchParams.get("cursor")');
    expect(endpoint).toContain("gt(schema.agents.id, cursor.value)");
    expect(endpoint).toContain("orderBy(asc(schema.agents.id))");
    expect(endpoint).toContain(".limit(limit + 1)");
    expect(endpoint).toContain("const hasMore = candidates.length > limit");
    expect(endpoint).toContain("next_cursor: nextCursor");
    expect(endpoint).toContain('code: "INVALID_CURSOR"');
  });

  it("keeps the live backfill operator-controlled and dry-run by default", () => {
    expect(ops).toContain('const APPLY = process.argv.includes("--apply")');
    expect(ops).toContain('mode: APPLY ? "apply" : "dry-run"');
    expect(ops).toContain("if (!APPLY)");
    expect(ops).toContain(
      "Re-run with --apply only after Twilio and the verified AgentMail custom domain are production-ready",
    );
    expect(ops).toContain("ensurePaidBotIdentity");
  });

  it("attaches automatic identity activation to create, Stripe, and the durable worker", () => {
    const worker = read("src/lib/job-worker.ts");
    const createRoute = read("src/routes/agent-routes-v2.ts");
    const stripeSync = read("src/lib/stripe-helpers.ts");
    const queue = read("src/lib/job-queue.ts");
    const spend = read("src/lib/provider-spend-job-pause.ts");
    expect(identity).toContain('PAID_BOT_IDENTITY_JOB_TYPE = "paid_bot_identity_reconcile"');
    expect(identity).toContain("enqueuePaidBotIdentityReconciliation");
    expect(createRoute).toContain("tx.insert(schema.jobs)");
    expect(createRoute).toContain("PAID_BOT_IDENTITY_JOB_TYPE");
    expect(stripeSync).toContain("enqueuePaidBotIdentityReconciliation(userId)");
    expect(stripeSync).toContain('if (stripeStatus === "active")');
    expect(worker).toContain("ensurePaidBotIdentity({ userId: ownerId, agentId })");
    expect(worker).toContain("PAID_BOT_IDENTITY_JOB_TYPE");
    expect(worker).toContain("assertLaunchProviderSpendAllowed(job)");
    expect(queue).toContain('| "paid_bot_identity_reconcile"');
    expect(spend).toContain('"paid_bot_identity_reconcile"');
  });
});
