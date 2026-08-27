import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agentmailLib = readFileSync("src/lib/agentmail-mail.ts", "utf8");
const agentmailRoutes = readFileSync("src/routes/agentmail-routes.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");
const mailboxCard = readFileSync("src/components/MailboxConnectionCard.tsx", "utf8");
const integrations = readFileSync("src/lib/integrations.ts", "utf8");
const bodyParsers = readFileSync("src/lib/body-parsers.ts", "utf8");

describe("BotBound managed AgentMail contract", () => {
  it("owns the platform credential server-side without copying it into managed tenant rows", () => {
    expect(agentmailRoutes).toContain("process.env.AGENTMAIL_API_KEY");
    expect(agentmailLib).toContain(
      'AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL = "botbound-managed-agentmail-v1"',
    );
    expect(agentmailLib).toContain("resolveAgentMailCredential");
    expect(agentmailLib).toContain("process.env.AGENTMAIL_API_KEY");
    expect(agentmailRoutes).toContain("encryptSecret(AGENTMAIL_MANAGED_CREDENTIAL_SENTINEL)");

    const managedSection = agentmailRoutes.slice(
      agentmailRoutes.indexOf('"/api/agents/:agentId/managed-mailbox"'),
      agentmailRoutes.indexOf('"/api/integrations/agentmail/connect"'),
    );
    expect(managedSection).not.toContain("encryptSecret(apiKey)");
  });

  it("provisions managed Bot mailboxes without customer OAuth or provider setup", () => {
    expect(agentmailRoutes).toContain('"/api/agents/:agentId/managed-mailbox"');
    expect(agentmailRoutes).toContain("managedMailboxUsername");
    expect(agentmailRoutes).toContain("resolveManagedBotInbox");
    expect(agentmailRoutes).toContain("AGENTMAIL_DEFAULT_DOMAIN");
    expect(agentmailRoutes).toContain('managed: "true"');
    expect(agentmailRoutes).toContain('provider: "agentmail"');
    expect(agentmailRoutes).toContain("upsertOwnedEmailAccount");
    expect(agentmailRoutes).toContain("EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE");
  });

  it("requires a BotBound custom domain and never falls back to a provider address", () => {
    const resolver = agentmailRoutes.slice(
      agentmailRoutes.indexOf("async function resolveManagedBotInbox"),
      agentmailRoutes.indexOf("/**\n * POST /api/agents/:agentId/managed-mailbox"),
    );
    expect(agentmailRoutes).toContain("Managed AgentMail custom-domain provisioning failed closed");
    expect(resolver).toContain("if (!preferredDomain)");
    expect(resolver).toContain("BotBound managed email domain is not ready");
    expect(resolver).not.toContain("AGENTMAIL_FREE_DOMAIN");
    const failureBranch = resolver.slice(
      resolver.indexOf("Managed AgentMail custom-domain provisioning failed closed"),
      resolver.indexOf("throw error;") + "throw error;".length,
    );
    expect(failureBranch).not.toContain("createManagedInboxAttempt");
    expect(resolver).toContain("usedCustomDomain: true");
    expect(agentmailLib).toContain("Confirm the domain is verified in the AgentMail organization");
  });

  it("keeps AgentMail infrastructure out of the normal customer Connections UI", () => {
    expect(mailboxCard).not.toMatch(/id:\s*"agentmail"/);
    expect(mailboxCard).not.toContain("/api/integrations/agentmail/connect");
    expect(mailboxCard).not.toContain("AgentMail API key");
    expect(mailboxCard).not.toContain("@agentmail.to");
    expect(mailboxCard).toContain("Your Bot email identity is managed automatically by BotBound");
    expect(mailboxCard).toContain("Optional inbox connections");
    expect(mailboxCard).toContain('id: "google"');
    expect(mailboxCard).toContain('id: "microsoft"');
    expect(mailboxCard).toContain('id: "icloud"');
  });

  it("retains the tenant-owned AgentMail connect path only as legacy compatibility", () => {
    const legacySection = agentmailRoutes.slice(
      agentmailRoutes.lastIndexOf(
        "/**",
        agentmailRoutes.indexOf('"/api/integrations/agentmail/connect"'),
      ),
    );
    expect(legacySection).toContain("Legacy/advanced compatibility path");
    expect(legacySection).toContain("encryptSecret(apiKey)");
    expect(legacySection).toContain("resolveAgentMailInbox");
    expect(legacySection).toContain("verifyAgentMailCredentials");
  });

  it("uses the managed sentinel transparently for IMAP, SMTP, and provider API execution", () => {
    expect(agentmailLib).toContain("pass: resolveAgentMailCredential(credential)");
    expect(agentmailLib).toContain("const apiKey = resolveAgentMailCredential(credential)");
    expect(integrations).toContain("fetchAgentMailInbox(email, apiKey, opts)");
    expect(integrations).toContain("sendAgentMail(email, apiKey, sendParams)");
  });

  it("registers signed inbound delivery without asking the Account Holder to configure webhooks", () => {
    expect(agentmailRoutes).toContain("ensureAgentMailWebhook");
    expect(agentmailRoutes).toContain("deleteAgentMailWebhooksForAccount");
    expect(agentmailRoutes).toContain("AgentMail webhook did not expose its signing secret");
    expect(agentmailRoutes).toContain(".returning({ id: schema.emailAccounts.id })");
    expect(registry).toContain('from "../routes/agentmail-webhook-routes"');
    expect(registry).toContain("app.use(agentmailWebhookRouter)");
  });

  it("accepts AgentMail's documented one-megabyte webhook envelope", () => {
    expect(bodyParsers).toContain('const AGENTMAIL_WEBHOOK_LIMIT = "1mb";');
    expect(bodyParsers).toMatch(
      /"\/api\/webhooks\/agentmail"[\s\S]*limit: AGENTMAIL_WEBHOOK_LIMIT/,
    );
  });

  it("is mounted in the explicit API registry", () => {
    expect(registry).toContain('from "../routes/agentmail-routes"');
    expect(registry).toContain("app.use(agentmailRouter)");
  });
});
