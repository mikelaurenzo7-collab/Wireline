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
const privacyNotice = read("public/chatgpt-app-privacy.html");
const submission = JSON.parse(read("chatgpt-app-submission.json")) as {
  app_info: { logo_url: string };
  oauth: { client_url: string };
  tools: Record<
    string,
    {
      annotations: {
        readOnlyHint: boolean;
        openWorldHint: boolean;
        destructiveHint: boolean;
      };
    }
  >;
};

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
    expect(accountRouteSource).toContain('name: "get_wireline_workspace_summary"');
    expect(accountRouteSource).toContain(
      'securitySchemes: [{ type: "oauth2", scopes: ["agents.write"] }]',
    );
    expect(accountRouteSource).toContain(
      'securitySchemes: [{ type: "oauth2", scopes: ["demo.voice"] }]',
    );
  });

  it("keeps private voice simulation tool-free, rate-limited, and non-read-only", () => {
    expect(accountRouteSource).toContain('toolChoice: "none"');
    expect(accountRouteSource).toContain("tools: []");
    expect(accountRouteSource).toContain("chatgpt-private-simulation");
    const simulationDescriptor = accountRouteSource.slice(
      accountRouteSource.indexOf('name: "start_private_voice_simulation"'),
      accountRouteSource.indexOf('name: "list_wireline_agents"'),
    );
    expect(simulationDescriptor).toContain("readOnlyHint: false");
    expect(simulationDescriptor).not.toContain("readOnlyHint: true");
    expect(submission.tools.start_private_voice_simulation.annotations).toEqual({
      readOnlyHint: false,
      openWorldHint: false,
      destructiveHint: false,
    });
  });

  it("exposes only aggregate, tenant-scoped workspace status", () => {
    expect(accountRouteSource).toContain('name: "get_wireline_workspace_summary"');
    expect(accountRouteSource).toContain("calls_last_30_days");
    expect(accountRouteSource).toContain("text_threads_last_30_days");
    expect(accountRouteSource).toContain("email_threads_last_30_days");
    expect(accountRouteSource).toContain("unread_text_count");
    expect(accountRouteSource).toContain("unread_email_count");
    expect(accountRouteSource).toContain("tenantStore.run(authed.userId");
    expect(accountRouteSource).toContain("never returns customer identities");
    expect(accountRouteSource).not.toContain("SELECT transcript");
    expect(accountRouteSource).not.toContain("SELECT recording_url");
    expect(accountRouteSource).not.toContain("SELECT customer_number");
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

  it("keeps submission identity and OAuth metadata aligned with production", () => {
    expect(submission.app_info.logo_url).toBe(
      "https://trywireline.com/wireline-chatgpt-app-icon.svg",
    );
    expect(submission.oauth.client_url).toBe(
      "https://chatgpt.com/oauth/7i4vMCsl-J2L/client.json",
    );
    expect(read("public/wireline-chatgpt-app-icon.svg")).toContain("<title id=\"title\">Wireline</title>");
  });

  it("publishes explicit, complete tool annotations in the submission packet", () => {
    expect(Object.keys(submission.tools)).toEqual([
      "create_agent_draft",
      "get_agent_draft",
      "update_agent_draft",
      "start_private_voice_simulation",
      "list_wireline_agents",
      "get_wireline_workspace_summary",
    ]);
    for (const tool of Object.values(submission.tools)) {
      expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
      expect(typeof tool.annotations.openWorldHint).toBe("boolean");
      expect(typeof tool.annotations.destructiveHint).toBe("boolean");
    }
  });

  it("discloses model-visible and widget-only returned data", () => {
    expect(privacyNotice).toContain("Information returned to ChatGPT");
    expect(privacyNotice).toContain("aggregate workspace summary");
    expect(privacyNotice).toContain("protected metadata");
    expect(privacyNotice).toContain("not included in the model-visible conversation");
  });

  it("states the account-first no-launch boundary consistently", () => {
    expect(rolloutDocs).toContain("No agent launch.");
    expect(submissionPacket).toContain("No agent launch.");
    expect(submissionPacket).toContain("No outbound or inbound calling from the ChatGPT app.");
    expect(submissionPacket).toContain("OAuth authorization code flow with PKCE `S256`.");
  });

  it("does not expose MCP tools that provision numbers, dial, or launch agents", () => {
    const forbidden = [
      "provision_phone",
      "place_call",
      "outbound_dial",
      "launch_agent",
      "attach_phone",
    ];
    for (const name of forbidden) {
      expect(accountRouteSource).not.toContain(`name: "${name}"`);
    }
    expect(accountRouteSource).toContain('name: "create_agent_draft"');
    expect(accountRouteSource).toContain("unlaunched Wireline agent draft");
  });
});
