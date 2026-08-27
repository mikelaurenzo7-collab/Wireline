import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("BotBound managed Bot identity", () => {
  it("provisions email and phone after the Bot record is committed without coupling their failures", () => {
    const bootstrap = read("src/lib/bot-identity-bootstrap.ts");
    expect(bootstrap).toContain(
      "Promise.all([bootstrapMailbox(agentId), bootstrapPhone(agentId)])",
    );
    expect(bootstrap).toContain(`/managed-mailbox`);
    expect(bootstrap).toContain('authFetch("/api/phone-numbers/provision"');
    expect(bootstrap).toContain("body: JSON.stringify({ agent_id: agentId })");
    expect(bootstrap).toContain('body?.code === "ACTIVATION_REQUIRED"');
    expect(bootstrap).toContain("status: 0");
  });

  it("keeps managed mailbox credentials server-owned and binds the inbox to the Bot", () => {
    const routes = read("src/routes/agentmail-routes.ts");
    const ownership = read("src/lib/owned-email-account.ts");
    expect(routes).toContain("process.env.AGENTMAIL_API_KEY");
    expect(routes).toContain("process.env.AGENTMAIL_DEFAULT_DOMAIN");
    expect(routes).toContain("client_id: clientId");
    expect(routes).toContain("agent_id: input.agentId");
    expect(routes).toContain("agentId,");
    expect(routes).toContain('MANAGED_SCOPE_MARKER = "managed-botbound"');
    expect(ownership).toContain("agentId?: string | null");
    expect(ownership).toContain("input.agentId !== undefined ? { agentId: input.agentId } : {}");
  });

  it("uses the configured custom domain as a launch invariant and fails closed when it is not ready", () => {
    const routes = read("src/routes/agentmail-routes.ts");
    expect(routes).toContain("managedMailboxDomain()");
    expect(routes).toContain('value === "botbound.me" || value.endsWith(".botbound.me")');
    expect(routes).not.toContain("AGENTMAIL_FREE_DOMAIN");
    expect(routes).toContain("Managed AgentMail custom-domain provisioning failed closed");
    expect(routes).toContain("throw error");
    expect(routes).not.toContain("custom-domain provisioning fell back to AgentMail domain");
  });

  it("never allocates a managed mailbox for an inactive or free Bot", () => {
    const routes = read("src/routes/agentmail-routes.ts");
    const endpoint = routes.slice(
      routes.indexOf('"/api/agents/:agentId/managed-mailbox"'),
      routes.indexOf('"/api/integrations/agentmail/connect"'),
    );

    expect(routes).toContain("hasManagedMailboxEntitlement");
    expect(routes).toContain("plan.price_usd_monthly > 0");
    expect(routes).toContain("plan.included_phone_numbers > 0");
    expect(endpoint).toContain('"ACTIVATION_REQUIRED"');
    expect(endpoint.indexOf("hasManagedMailboxEntitlement")).toBeLessThan(
      endpoint.indexOf("resolveManagedBotInbox"),
    );
  });

  it("protects platform-managed mailboxes from the legacy AgentMail disconnect path", () => {
    const routes = read("src/routes/agentmail-routes.ts");
    expect(routes).toContain("const legacyAccounts = accounts.filter(");
    expect(routes).toContain("!hasExactAgentMailManagedScope(account.oauthGrantedScopes)");
  });

  it("hides AgentMail from the customer connection catalog while retaining customer-owned mail providers", () => {
    const mailbox = read("src/components/MailboxConnectionCard.tsx");
    const customerProviders = mailbox.slice(
      mailbox.indexOf("const PROVIDERS"),
      mailbox.indexOf("export default function MailboxConnectionCard"),
    );
    expect(customerProviders).not.toContain('id: "agentmail"');
    expect(customerProviders).toContain('id: "google"');
    expect(customerProviders).toContain('id: "microsoft"');
    expect(customerProviders).toContain('id: "icloud"');
    expect(mailbox).toContain('account.provider !== "agentmail"');
  });

  it("resumes idempotently in Studio and never resets the user's setup step during background provisioning", () => {
    const studio = read("src/pages/AgentStudioHome.tsx");
    const createFlow = read("src/lib/wireline-create-flow.ts");
    expect(studio).toContain("bootstrapManagedBotIdentity(payload.agentId)");
    expect(studio).toContain("identityBootstrapAgentIds.current.has(payload.agentId)");
    expect(studio).toContain("identityBootstrapComplete: true");
    expect(studio).toContain("updatePostCreateWizard(pending)");
    expect(studio).toContain("updatePostCreateWizard(updated)");
    expect(createFlow).toContain("export function updatePostCreateWizard");
    expect(createFlow).toContain("without moving the user's current step");
  });
});
