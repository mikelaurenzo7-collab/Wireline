import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const agentmailLib = readFileSync("src/lib/agentmail-mail.ts", "utf8");
const agentmailRoutes = readFileSync("src/routes/agentmail-routes.ts", "utf8");
const registry = readFileSync("src/server/register-api-routes.ts", "utf8");
const mailboxCard = readFileSync("src/components/MailboxConnectionCard.tsx", "utf8");
const envExample = readFileSync(".env.example", "utf8");
const integrations = readFileSync("src/lib/integrations.ts", "utf8");

describe("agentmail mailbox contract", () => {
  it("never treats AgentMail as a shared platform env key", () => {
    expect(agentmailLib).not.toMatch(/process\.env\.AGENTMAIL_API_KEY/);
    expect(agentmailRoutes).not.toMatch(/process\.env\.AGENTMAIL_API_KEY/);
    expect(integrations).not.toMatch(/process\.env\.AGENTMAIL_API_KEY/);
    expect(envExample).not.toMatch(/^AGENTMAIL_API_KEY=/m);
    expect(envExample).toContain("do not set a shared AGENTMAIL_API_KEY");
  });

  it("stores the tenant key through the mailbox ownership guard", () => {
    expect(agentmailRoutes).toContain("upsertOwnedEmailAccount");
    expect(agentmailRoutes).toContain("EMAIL_ACCOUNT_OWNERSHIP_CONFLICT_MESSAGE");
    expect(agentmailRoutes).toContain('provider: "agentmail"');
    expect(agentmailRoutes).toContain("encryptSecret(apiKey)");
    expect(agentmailRoutes).not.toContain("target: schema.emailAccounts.emailAddress");
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
