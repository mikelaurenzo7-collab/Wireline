import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const oauthRouteSource = read("src/routes/chatgpt-mcp-routes.ts");
const accountRouteSource = read("src/routes/chatgpt-mcp-account-routes.ts");
const widgetSource = read("src/lib/chatgpt-mcp-account.ts");
const profileSource = read("src/lib/agent-customization.ts");
const draftServiceSource = read("src/lib/agent-draft-service.ts");
const rolloutDocs = read("docs/CHATGPT_APP.md");
const submissionPacket = read("docs/CHATGPT_APP_SUBMISSION.md");
const privacyNotice = read("public/chatgpt-app-privacy.html");
const mcpMetadataSource = read("src/lib/mcp-app-metadata.ts");
const submission = JSON.parse(read("chatgpt-app-submission.json")) as {
  app_info: {
    display_name: string;
    logo_url: string;
    website_url: string;
    contact_email: string;
    privacy_policy_url: string;
    subtitle?: string;
  };
  oauth: {
    client_url: string;
    authorization_url: string;
    token_url: string;
  };
  test_cases?: unknown;
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

describe("BotBound ChatGPT App production contract", () => {
  it("publishes the required MCP and OAuth discovery surfaces", () => {
    expect(accountRouteSource).toContain('router.post("/mcp"');
    expect(oauthRouteSource).toContain('"/.well-known/oauth-protected-resource"');
    expect(oauthRouteSource).toContain('"/.well-known/oauth-authorization-server"');
    expect(oauthRouteSource).toContain("client_id_metadata_document_supported: true");
    expect(oauthRouteSource).toContain('code_challenge_method: "S256"');
    expect(accountRouteSource).toContain("assertMcpDraftWriteRateLimit");
    expect(oauthRouteSource).toContain("assertMcpTokenEndpointRateLimit");
    expect(oauthRouteSource).toContain("revokeMcpAccessTokensForClient");
    expect(oauthRouteSource).toContain("backfillMcpOAuthResourceBindings");
  });

  it("keeps connected-client identifiers stable beneath the BotBound presentation", () => {
    expect(mcpMetadataSource).toContain('MCP_SERVER_NAME = "wireline"');
    expect(mcpMetadataSource).toContain('name: "com.trywireline/mcp"');
    expect(mcpMetadataSource).toContain('"com.trywireline/docs"');
    expect(accountRouteSource).toContain('name: "list_wireline_agents"');
    expect(accountRouteSource).toContain('name: "train_wireline_agent"');
    expect(accountRouteSource).toContain("open_in_wireline_url");
    expect(accountRouteSource).toContain("landed_in_wireline");
  });

  it("allows Cursor and Claude dynamic OAuth registration callbacks", () => {
    const registry = read("src/lib/mcp-client-registry.ts");
    expect(registry).toContain("isCursorRedirectUri");
    expect(registry).toContain("cursor://anysphere.cursor-mcp/oauth/callback");
    expect(registry).toContain("https://www.cursor.com/agents/mcp/oauth/callback");
    expect(registry).toContain("http://localhost:8787/callback");
    expect(registry).toContain("isAnthropicRedirectUri");
    expect(oauthRouteSource).toContain("isTrustedDynamicRedirectUri(value)");
  });

  it("requires OAuth for every production agent operation", () => {
    expect(accountRouteSource).toContain('name: "create_agent_draft"');
    expect(accountRouteSource).toContain('title: "Create a BotBound agent draft"');
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
    expect(simulationDescriptor).toContain("confirmed");
    expect(accountRouteSource).toContain("assertRehearsalConfirmation(args.confirmed)");
    expect(accountRouteSource).toContain("mcpVoiceSimulationMeta");
    expect(widgetSource).toContain("confirmed: true");
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
    expect(accountRouteSource).toContain("unlaunched BotBound agent draft");
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
    expect(submission.app_info.display_name).toBe("BotBound");
    expect(submission.app_info.logo_url).toBe("https://botbound.app/botbound-icon-512.png");
    expect(submission.app_info.website_url).toBe("https://botbound.app");
    expect(submission.app_info.privacy_policy_url).toBe(
      "https://botbound.app/chatgpt-app-privacy.html",
    );
    expect(submission.app_info.contact_email).toBe("support@botbound.app");
    expect(submission.oauth.client_url).toBe("https://chatgpt.com/oauth/7i4vMCsl-J2L/client.json");
    expect(submission.oauth.authorization_url).toBe("https://botbound.app/mcp/oauth/authorize");
    expect(submission.oauth.token_url).toBe("https://botbound.app/mcp/oauth/token");
    expect(submissionPacket).toContain("https://botbound.app/mcp");
    expect(submissionPacket).not.toContain("https://trywireline.com/mcp");
    expect(read("public/botbound-icon.svg")).toContain('<title id="title">BotBound</title>');
  });

  it("makes the release probe certify one coherent canonical MCP origin", () => {
    const releaseProbe = read("scripts/check-chatgpt-app-release.mjs");
    expect(releaseProbe).toContain("CANONICAL_PRODUCTION_URL");
    expect(releaseProbe).toContain('request("/botbound-icon.svg"');
    expect(releaseProbe).toContain("protectedResource.body.resource === `${origin}/mcp`");
    expect(releaseProbe).toContain("authorizationServer.body.issuer === origin");
    expect(releaseProbe).toContain("serverCard.body.websiteUrl === origin");
    expect(releaseProbe).toContain("!claudeDocs.body.includes(legacyMcpEndpoint)");
    expect(releaseProbe).toContain("!cursorDocs.body.includes(legacyMcpEndpoint)");
  });

  it("publishes explicit, complete tool annotations in the submission packet", () => {
    expect(Object.keys(submission.tools)).toEqual([
      "create_agent_draft",
      "get_agent_draft",
      "update_agent_draft",
      "start_private_voice_simulation",
      "list_wireline_agents",
      "get_wireline_workspace_summary",
      "get_wireline_agent_status",
      "run_private_agent_turn",
      "get_agent_coaching_brief",
      "train_wireline_agent",
    ]);
    for (const tool of Object.values(submission.tools)) {
      expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
      expect(typeof tool.annotations.openWorldHint).toBe("boolean");
      expect(typeof tool.annotations.destructiveHint).toBe("boolean");
    }
  });

  it("discloses model-visible and widget-only returned data", () => {
    expect(privacyNotice).toMatch(/<h2>Information Returned to ChatGPT<\/h2>/i);
    expect(privacyNotice).toContain("aggregate workspace summary");
    expect(privacyNotice).toContain("protected metadata");
    expect(privacyNotice).toContain("The answer is not included in the model-visible conversation");
    expect(privacyNotice).toContain("no OpenAI credential is returned to the widget");
    expect(privacyNotice).toContain("build their first Bot in ChatGPT");
    expect(privacyNotice).not.toMatch(/\bvoice agents?\b/i);
  });

  it("states the account-first no-launch boundary consistently", () => {
    expect(rolloutDocs).toContain("No agent launch.");
    expect(submissionPacket).toContain("No agent launch.");
    expect(submissionPacket).toContain("No outbound or inbound calling from the ChatGPT app.");
    expect(submissionPacket).toContain("OAuth authorization code flow with PKCE `S256`.");
    expect(submissionPacket).toContain("Build your first Bot");
    expect(submission.app_info.subtitle).toBe("Build your first Bot");
    expect(JSON.stringify(submission.test_cases)).toContain("create_agent_draft");
    expect(JSON.stringify(submission.test_cases)).toContain("get_agent_coaching_brief");
    expect(JSON.stringify(submission.test_cases)).toContain("train_wireline_agent");
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
    expect(accountRouteSource).toContain(
      "unlaunched Bot in the connected user’s BotBound workspace",
    );
    expect(accountRouteSource).toContain('name: "train_wireline_agent"');
    expect(accountRouteSource).toContain("readMcpCoachingWritesEnabled");
  });
});
