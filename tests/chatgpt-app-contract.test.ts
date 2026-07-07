import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const oauthRouteSource = read("src/routes/chatgpt-mcp-routes.ts");
const accountRouteSource = read("src/routes/chatgpt-mcp-account-routes.ts");
const profileSource = read("src/lib/agent-customization.ts");
const draftServiceSource = read("src/lib/agent-draft-service.ts");
const rolloutDocs = read("docs/CHATGPT_APP.md");
const submissionPacket = read("docs/CHATGPT_APP_SUBMISSION.md");

describe("Wireline ChatGPT App production contract", () => {
  it("publishes the required MCP and OAuth discovery surfaces", () => {
    expect(accountRouteSource).toContain('router.post("/mcp"');
    expect(oauthRouteSource).toContain('"/.well-known/oauth-protected-resource"');
    expect(oauthRouteSource).toContain('"/.well-known/oauth-authorization-server"');
    expect(oauthRouteSource).toContain("client_id_metadata_document_supported: true");
    expect(oauthRouteSource).toContain('code_challenge_method: "S256"');
    expect(oauthRouteSource).toContain("assertMcpDraftWriteRateLimit");
    expect(oauthRouteSource).toContain("assertMcpTokenEndpointRateLimit");
    expect(oauthRouteSource).toContain("revokeMcpAccessTokensForClient");
    expect(oauthRouteSource).toContain("backfillMcpOAuthResourceBindings");
    expect(oauthRouteSource).toContain("client_id_metadata_document_supported: true");
  });

  it("allows Cursor and Claude dynamic OAuth registration callbacks", () => {
    const registry = read("src/lib/mcp-client-registry.ts");
    expect(registry).toContain("isCursorRedirectUri");
    expect(registry).toContain("cursor://anysphere.cursor-mcp/oauth/callback");
    expect(registry).toContain("https://www.cursor.com/agents/mcp/oauth/callback");
    expect(registry).toContain("isAnthropicRedirectUri");
  });

  it("requires OAuth for every production agent operation", () => {
    expect(accountRouteSource).toContain('name: "create_agent_draft"');
    expect(accountRouteSource).toContain('name: "get_agent_draft"');
    expect(accountRouteSource).toContain('name: "update_agent_draft"');
    expect(accountRouteSource).toContain('name: "start_private_voice_simulation"');
    expect(accountRouteSource).toContain(
      'securitySchemes: [{ type: "oauth2", scopes: ["agents.write"] }]',
    );
    expect(accountRouteSource).toContain(
      'securitySchemes: [{ type: "oauth2", scopes: ["demo.voice"] }]',
    );
  });

  it("keeps private voice simulation tool-free and rate-limited", () => {
    expect(accountRouteSource).toContain('toolChoice: "none"');
    expect(accountRouteSource).toContain("tools: []");
    expect(accountRouteSource).toContain("chatgpt-private-simulation");
  });

  it("requires explicit confirmation before a private draft is created or changed", () => {
    expect(accountRouteSource).toContain("assertDraftConfirmation(args.confirmed)");
    expect(accountRouteSource).toContain('requireScope(principal, "agents.write")');
    expect(draftServiceSource).toContain('lifecycle: "draft"');
    expect(accountRouteSource).toContain("unlaunched Wireline agent draft");
  });

  it("keeps agent customization canonical across client surfaces", () => {
    expect(profileSource).toContain("normalizeAgentCustomization");
    expect(profileSource).toContain("compileAgentRuntimeInstructions");
    expect(profileSource).toContain("allowedActions");
    expect(profileSource).toContain("prohibitedTopics");
    expect(profileSource).toContain("escalationPolicy");
    expect(draftServiceSource).toContain("createAgentDraft");
    expect(draftServiceSource).toContain("updateAgentDraft");
  });

  it("states the account-first no-launch boundary consistently", () => {
    expect(rolloutDocs).toContain("No agent launch.");
    expect(submissionPacket).toContain("No agent launch.");
    expect(submissionPacket).toContain("No outbound or inbound calling from the ChatGPT app.");
    expect(submissionPacket).toContain("OAuth authorization code flow with PKCE `S256`.");
  });
});
