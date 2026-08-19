import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("BotBound managed Bot identity", () => {
  it("provisions email and phone after the Bot record is committed without coupling their failures", () => {
    const bootstrap = read("src/lib/bot-identity-bootstrap.ts");
    expect(bootstrap).toContain("Promise.all([bootstrapMailbox(agentId), bootstrapPhone(agentId)])");
    expect(bootstrap).toContain(`/managed-mailbox`);
    expect(bootstrap).toContain('authFetch("/api/phone-numbers/provision"');
    expect(bootstrap).toContain('body: JSON.stringify({ agent_id: agentId })');
    expect(bootstrap).toContain('body?.code === "ACTIVATION_REQUIRED"');
    expect(bootstrap).toContain("status: 0");
  });

  it("keeps managed mailbox credentials server-owned and binds the inbox to the Bot", () => {
    const routes = read("src/routes/agentmail-routes.ts");
    const ownership = read("src/lib/owned-email-account.ts");
    expect(routes).toContain('process.env.AGENTMAIL_API_KEY');
    expect(routes).toContain('process.env.AGENTMAIL_DEFAULT_DOMAIN');
    expect(routes).toContain('client_id: clientId');
    expect(routes).toContain('agent_id: input.agentId');
    expect(routes).toContain('agentId,');
    expect(routes).toContain('MANAGED_SCOPE_MARKER = "managed-botbound"');
    expect(ownership).toContain('agentId?: string | null');
    expect(ownership).toContain('input.agentId !== undefined ? { agentId: input.agentId } : {}');
  });

  it("uses a verified custom domain when available and falls back rather than failing Bot creation", () => {
    const routes = read("src/routes/agentmail-routes.ts");
    expect(routes).toContain("managedMailboxDomain()");
    expect(routes).toContain("AGENTMAIL_FREE_DOMAIN");
    expect(routes).toContain("custom-domain provisioning fell back to AgentMail domain");
    expect(routes).toContain("usedCustomDomain: false");
  });

  it("protects platform-managed mailboxes from the legacy AgentMail disconnect path", () => {
    const routes = read("src/routes/agentmail-routes.ts");
    expect(routes).toContain("const legacyAccounts = accounts.filter(");
    expect(routes).toContain("!account.oauthGrantedScopes?.includes(MANAGED_SCOPE_MARKER)");
  });

  it("hides AgentMail from the customer connection catalog while retaining customer-owned mail providers", () => {
    const catalog = read("src/lib/workspace-integration-catalog.ts");
    expect(catalog).not.toContain('id: "agentmail"');
    expect(catalog).toContain('id: "google"');
    expect(catalog).toContain('id: "microsoft"');
    expect(catalog).toContain('id: "yahoo"');
    expect(catalog).toContain('id: "icloud"');
    expect(catalog).toContain('label: "BotBound Calling & Messaging"');
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
