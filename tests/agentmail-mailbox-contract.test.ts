import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agentmailLib = readFileSync("src/lib/agentmail-mail.ts", "utf8");
const agentmailRoutes = readFileSync("src/routes/agentmail-routes.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");
const mailboxCard = readFileSync("src/components/MailboxConnectionCard.tsx", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const integrations = readFileSync("src/lib/integrations.ts", "utf8");
const bodyParsers = readFileSync("src/lib/body-parsers.ts", "utf8");

describe("agentmail mailbox contract", () => {
  it("never treats AgentMail as a shared platform env key", () => {
    expect(agentmailLib).not.toMatch(/process\.env\.AGENTMAIL_API_KEY/);
    expect(agentmailRoutes).not.toMatch(/process\.env\.AGENTMAIL_API_KEY/);
    expect(integrations).not.toMatch(/process\.env\.AGENTMAIL_API_KEY/);
    expect(envExample).not.toMatch(/^AGENTMAIL_API_KEY=/m);
    expect(envExample).not.toMatch(/^AGENTMAIL_WEBHOOK_SECRET=/m);
    expect(envExample).toContain("do not set a shared AGENTMAIL_API_KEY");
    expect(agentmailLib).not.toMatch(/process\.env\.AGENTMAIL_WEBHOOK_SECRET/);
    expect(agentmailRoutes).not.toMatch(/process\.env\.AGENTMAIL_WEBHOOK_SECRET/);
  });

  it("stores the tenant key through the mailbox ownership guard", () => {
    expect(agentmailRoutes).toContain("upsertOwnedEmailAccount");
    expect(agentmailRoutes).toContain("EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE");
    expect(agentmailRoutes).toContain('provider: "agentmail"');
    expect(agentmailRoutes).toContain("encryptSecret(apiKey)");
    expect(agentmailRoutes).not.toContain("target: schema.emailAccounts.emailAddress");
  });

  it("keys connection mutations by the authenticated tenant, not a shared IP bucket", () => {
    expect(agentmailRoutes).toContain("createRateLimiter");
    expect(agentmailRoutes).not.toContain("createIpRateLimiter");
    expect(agentmailRoutes).toMatch(
      /"\/api\/integrations\/agentmail\/connect",\s*authenticateUser,\s*agentmailConnectRateLimiter,\s*validateBody/,
    );
    expect(agentmailRoutes).toMatch(
      /"\/api\/integrations\/agentmail\/disconnect",\s*authenticateUser,\s*agentmailConnectRateLimiter/,
    );
  });

  it("registers inbound delivery on connect without asking the Account Holder to set up webhooks", () => {
    expect(agentmailRoutes).toContain("ensureAgentMailWebhook");
    expect(agentmailRoutes).toContain("deleteAgentMailWebhooksForAccount");
    expect(mailboxCard.toLowerCase()).not.toContain("webhook");
    expect(mailboxCard).toContain("trywireline@agentmail.to");
    expect(mailboxCard).toContain("/api/emails/accounts/");
    expect(registry).toContain('from "../routes/agentmail-webhook-routes"');
    expect(registry).toContain("app.use(agentmailWebhookRouter)");
  });

  it("removes a new webhook if its signing secret cannot be persisted", () => {
    expect(agentmailRoutes).toContain("deleteAgentMailWebhook");
    expect(agentmailRoutes).toContain(".returning({ id: schema.emailAccounts.id })");
    expect(agentmailRoutes).toContain(
      "await deleteAgentMailWebhook(apiKey, ensured.webhookId)",
    );
    expect(agentmailRoutes).toContain("AgentMail orphan webhook cleanup failed");
  });

  it("accepts AgentMail's documented one-megabyte webhook envelope", () => {
    expect(bodyParsers).toContain('const AGENTMAIL_WEBHOOK_LIMIT = "1mb";');
    expect(bodyParsers).toMatch(
      /"\/api\/webhooks\/agentmail"[\s\S]*limit: AGENTMAIL_WEBHOOK_LIMIT/,
    );
    expect(bodyParsers).toMatch(
      /"\/api\/webhooks\/resend"[\s\S]*limit: RESEND_WEBHOOK_LIMIT/,
    );
  });

  it("cleans AgentMail delivery subscriptions on the Connections disconnect path", () => {
    const revocation = readFileSync("src/lib/oauth-provider-revocation.ts", "utf8");
    const emailRoutes = readFileSync("src/routes/email-routes.ts", "utf8");
    expect(revocation).toContain("deleteAgentMailWebhooksForAccount");
    expect(revocation).toContain("deleteWirelineAgentMailWebhooks");
    expect(revocation).toContain('case "agentmail"');
    expect(emailRoutes).toContain("revokeMailboxAccountTokens");
    expect(emailRoutes).toContain("account.id");
  });

  it("is mounted in the explicit API registry", () => {
    expect(registry).toContain('from "../routes/agentmail-routes"');
    expect(registry).toContain("app.use(agentmailRouter)");
  });

  it("exposes AgentMail in Connections and keeps Yahoo out until IMAP ships", () => {
    expect(mailboxCard).toMatch(/id:\s*"agentmail"/);
    expect(mailboxCard).toContain("/api/integrations/agentmail/connect");
    expect(mailboxCard).not.toMatch(/id:\s*"yahoo"/);
  });
});
