import { CANONICAL_PRODUCTION_URL, LEGACY_COMPATIBILITY_URL } from "./lib/production-url.mjs";

const argumentIndex = process.argv.findIndex((argument) => argument === "--url");
const explicitUrl = argumentIndex >= 0 ? process.argv[argumentIndex + 1] : "";
const baseUrl = (explicitUrl || process.env.APP_URL || CANONICAL_PRODUCTION_URL)
  .trim()
  .replace(/\/+$/, "");
const canonicalMcpEndpoint = `${CANONICAL_PRODUCTION_URL}/mcp`;
const legacyMcpEndpoint = `${LEGACY_COMPATIBILITY_URL}/mcp`;

let origin;
try {
  origin = new URL(baseUrl).origin;
} catch {
  throw new Error("APP_URL must be a valid absolute URL.");
}

const accountWidgetUri = "ui://widget/wireline-agent-draft-v2.html";
const expectedAnnotations = new Map([
  ["create_agent_draft", { readOnlyHint: false, openWorldHint: false, destructiveHint: false }],
  ["get_agent_draft", { readOnlyHint: true, openWorldHint: false, destructiveHint: false }],
  ["update_agent_draft", { readOnlyHint: false, openWorldHint: false, destructiveHint: false }],
  [
    "start_private_voice_simulation",
    { readOnlyHint: false, openWorldHint: false, destructiveHint: false },
  ],
  ["list_wireline_agents", { readOnlyHint: true, openWorldHint: false, destructiveHint: false }],
  [
    "get_wireline_workspace_summary",
    { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  ],
  [
    "get_wireline_agent_status",
    { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  ],
  ["run_private_agent_turn", { readOnlyHint: false, openWorldHint: false, destructiveHint: false }],
  [
    "get_agent_coaching_brief",
    { readOnlyHint: true, openWorldHint: false, destructiveHint: false },
  ],
  ["train_wireline_agent", { readOnlyHint: false, openWorldHint: false, destructiveHint: false }],
]);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function request(path, init = {}) {
  const response = await fetch(`${origin}${path}`, {
    redirect: "error",
    headers: { Accept: "application/json", ...(init.headers || {}) },
    ...init,
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  return { response, body, contentType };
}

async function jsonRpc(method, params = {}, id = method) {
  const { response, body } = await request("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  assert(response.status === 200, `${method}: expected HTTP 200, received ${response.status}.`);
  assert(
    body && typeof body === "object" && !Array.isArray(body),
    `${method}: expected JSON-RPC response.`,
  );
  assert(!body.error, `${method}: ${body.error?.message || "MCP returned an error."}`);
  assert(body.result, `${method}: MCP result is missing.`);
  return { response, result: body.result };
}

const icon = await request("/botbound-icon.svg", {
  headers: { Accept: "image/svg+xml" },
});
assert(icon.response.status === 200, "Dedicated ChatGPT app icon must return HTTP 200.");
assert(
  icon.contentType.includes("image/svg+xml"),
  "Dedicated ChatGPT app icon must be served as SVG.",
);
assert(
  typeof icon.body === "string" && icon.body.includes('<title id="title">BotBound</title>'),
  "BotBound app icon is malformed.",
);

const privacy = await request("/chatgpt-app-privacy.html", { headers: { Accept: "text/html" } });
assert(privacy.response.status === 200, "ChatGPT app privacy notice must return HTTP 200.");
assert(
  typeof privacy.body === "string" && privacy.body.includes("Information returned to ChatGPT"),
  "Privacy notice must disclose information returned to ChatGPT.",
);
assert(
  privacy.body.includes("receives a session-bound connection answer") &&
    privacy.body.includes("no OpenAI credential is returned"),
  "Privacy notice must disclose server-mediated SDP without a widget credential.",
);

const mcpPrivacy = await request("/mcp-privacy.html", { headers: { Accept: "text/html" } });
assert(mcpPrivacy.response.status === 200, "MCP connector privacy notice must return HTTP 200.");
assert(
  typeof mcpPrivacy.body === "string" &&
    mcpPrivacy.body.includes("Information returned to the connecting client"),
  "MCP privacy notice must disclose information returned to connecting clients.",
);

const claudeDocs = await request("/claude-connector.html", { headers: { Accept: "text/html" } });
assert(claudeDocs.response.status === 200, "Claude connector documentation must return HTTP 200.");
assert(
  typeof claudeDocs.body === "string" && claudeDocs.body.includes(canonicalMcpEndpoint),
  "Claude connector documentation must publish the canonical MCP endpoint.",
);
assert(
  typeof claudeDocs.body === "string" && !claudeDocs.body.includes(legacyMcpEndpoint),
  "Claude connector documentation must not publish the compatibility origin as canonical.",
);

const cursorDocs = await request("/cursor-plugin.html", { headers: { Accept: "text/html" } });
assert(cursorDocs.response.status === 200, "Cursor plugin documentation must return HTTP 200.");
assert(
  typeof cursorDocs.body === "string" && cursorDocs.body.includes(canonicalMcpEndpoint),
  "Cursor plugin documentation must publish the canonical MCP endpoint.",
);
assert(
  typeof cursorDocs.body === "string" && !cursorDocs.body.includes(legacyMcpEndpoint),
  "Cursor plugin documentation must not publish the compatibility origin as canonical.",
);
assert(
  typeof cursorDocs.body === "string" && cursorDocs.body.includes("not a repo voice SDK"),
  "Cursor plugin documentation must refuse repo-SDK positioning.",
);
assert(
  typeof cursorDocs.body === "string" &&
    cursorDocs.body.includes(
      "cursor://anysphere.cursor-deeplink/mcp/install?name=botbound&amp;config=eyJ1cmwiOiJodHRwczovL2JvdGJvdW5kLm1lL21jcCJ9",
    ),
  "Cursor plugin documentation must publish the one-click install deeplink.",
);

const protectedResource = await request("/.well-known/oauth-protected-resource");
assert(
  protectedResource.response.status === 200,
  "Protected-resource discovery must return HTTP 200.",
);
assert(
  (protectedResource.response.headers.get("cache-control") || "")
    .toLowerCase()
    .includes("no-store"),
  "Protected-resource discovery must set Cache-Control: no-store.",
);
assert(
  protectedResource.body &&
    typeof protectedResource.body === "object" &&
    !Array.isArray(protectedResource.body),
  "Protected-resource discovery must return JSON.",
);
assert(
  protectedResource.body.resource === `${origin}/mcp`,
  "Protected-resource discovery must bind to the probed MCP origin.",
);
assert(
  Array.isArray(protectedResource.body.authorization_servers) &&
    protectedResource.body.authorization_servers.length === 1 &&
    protectedResource.body.authorization_servers[0] === origin,
  "Protected-resource discovery must name the probed authorization server.",
);

const authorizationServer = await request("/.well-known/oauth-authorization-server");
assert(
  authorizationServer.response.status === 200,
  "Authorization-server discovery must return HTTP 200.",
);
assert(
  (authorizationServer.response.headers.get("cache-control") || "")
    .toLowerCase()
    .includes("no-store"),
  "Authorization-server discovery must set Cache-Control: no-store.",
);
assert(
  authorizationServer.body &&
    typeof authorizationServer.body === "object" &&
    !Array.isArray(authorizationServer.body),
  "Authorization-server discovery must return JSON.",
);
assert(
  authorizationServer.body.issuer === origin,
  "Authorization-server discovery must bind its issuer to the probed origin.",
);
assert(
  authorizationServer.body.authorization_endpoint === `${origin}/mcp/oauth/authorize`,
  "Authorization-server discovery must publish the authorization endpoint on the probed origin.",
);
assert(
  authorizationServer.body.token_endpoint === `${origin}/mcp/oauth/token`,
  "Authorization-server discovery must publish the token endpoint on the probed origin.",
);
assert(
  authorizationServer.body.registration_endpoint === `${origin}/mcp/oauth/register`,
  "Authorization server must advertise dynamic client registration for Cursor and Claude.",
);
assert(
  Array.isArray(authorizationServer.body.token_endpoint_auth_methods_supported) &&
    authorizationServer.body.token_endpoint_auth_methods_supported.includes("none"),
  "Authorization server must advertise public-client token auth for Cursor DCR.",
);
assert(
  authorizationServer.body.client_id_metadata_document_supported === true,
  "Authorization server must support ChatGPT client metadata documents.",
);
assert(
  Array.isArray(authorizationServer.body.code_challenge_methods_supported) &&
    authorizationServer.body.code_challenge_methods_supported.includes("S256"),
  "Authorization server must advertise PKCE S256.",
);

const rejectedRegistration = await request("/mcp/oauth/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    client_name: "Cursor Directory probe",
    redirect_uris: ["https://evil.example/callback"],
    token_endpoint_auth_method: "none",
  }),
});
assert(
  rejectedRegistration.response.status === 400,
  "Dynamic registration must reject unofficial Cursor/Claude redirect URIs.",
);
assert(
  rejectedRegistration.body && rejectedRegistration.body.error === "invalid_redirect_uri",
  "Dynamic registration must name invalid_redirect_uri for unofficial callbacks.",
);

const initialized = await jsonRpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "wireline-release-probe", version: "1.0.0" },
});
assert(
  initialized.result.serverInfo?.name === "wireline",
  "MCP server identity is not the stable wireline technical namespace.",
);

const tools = await jsonRpc("tools/list");
const liveTools = tools.result.tools || [];
const liveToolNames = new Set(liveTools.map((tool) => tool?.name));
for (const name of expectedAnnotations.keys())
  assert(liveToolNames.has(name), `MCP tool missing: ${name}.`);
assert(
  liveTools.length === expectedAnnotations.size,
  `Expected ${expectedAnnotations.size} MCP tools, received ${liveTools.length}.`,
);
for (const tool of liveTools) {
  assert(
    Array.isArray(tool.securitySchemes) && tool.securitySchemes.length > 0,
    `${tool.name}: OAuth security scheme is missing.`,
  );
  assert(
    tool.outputSchema && typeof tool.outputSchema === "object",
    `${tool.name}: outputSchema is missing.`,
  );
  assert(
    typeof tool.title === "string" && tool.title.trim().length > 0,
    `${tool.name}: title is missing.`,
  );
  const expected = expectedAnnotations.get(tool.name);
  assert(expected, `Unexpected MCP tool exposed: ${tool.name}.`);
  for (const [key, value] of Object.entries(expected)) {
    assert(
      typeof tool.annotations?.[key] === "boolean",
      `${tool.name}: ${key} must be an explicit boolean.`,
    );
    assert(tool.annotations[key] === value, `${tool.name}: ${key} must be ${value}.`);
  }
}

const lazyAuthCalls = [
  ["create_agent_draft", { business_name: "Acme", primary_goal: "Answer after hours" }],
  ["update_agent_draft", { agent_id: "draft" }],
  [
    "run_private_agent_turn",
    { agent_id: "draft", customer_message: "Do you have Saturday appointments?" },
  ],
  [
    "train_wireline_agent",
    { agent_id: "draft", kind: "fact", content: "We serve residential HVAC." },
  ],
  ["list_wireline_agents", {}],
];
for (const [name, args] of lazyAuthCalls) {
  const { response, body } = await request("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: name,
      method: "tools/call",
      params: { name, arguments: args },
    }),
  });
  assert(
    response.status === 401,
    `${name}: unauthenticated tools/call must be HTTP 401 so the host can show Connect, received ${response.status}.`,
  );
  assert(
    (response.headers.get("www-authenticate") || "").includes("invalid_token"),
    `${name}: WWW-Authenticate must challenge with invalid_token.`,
  );
  assert(
    body && typeof body === "object" && body.error?.code === -32001,
    `${name}: unauthenticated tools/call must be a JSON-RPC auth error, not a 200 isError result.`,
  );
}

const resources = await jsonRpc("resources/list");
assert(
  (resources.result.resources || []).some((resource) => resource?.uri === accountWidgetUri),
  "Account-bound widget resource is missing.",
);

const resource = await jsonRpc("resources/read", { uri: accountWidgetUri });
const content = resource.result.contents?.[0];
assert(
  content?.uri === accountWidgetUri,
  "Account-bound widget resource did not resolve correctly.",
);
assert(
  content?.mimeType === "text/html;profile=mcp-app",
  "Widget resource MIME type is incorrect.",
);
assert(
  typeof content?.text === "string" && content.text.includes("BotBound Bot draft"),
  "Widget HTML is missing or malformed.",
);
assert(
  Array.isArray(content?._meta?.ui?.csp?.connectDomains) &&
    content._meta.ui.csp.connectDomains.length === 0,
  "Widget CSP must not allow direct provider connections; Realtime signaling is server-mediated.",
);
assert(
  content.text.includes("offer_sdp: localSdp") &&
    !content.text.includes("https://api.openai.com/v1/realtime/calls") &&
    !content.text.includes("session.client_secret"),
  "Widget must exchange SDP through the authenticated MCP tool without receiving a provider credential.",
);
assert(
  content?._meta?.ui?.csp?.resourceDomains?.includes("https://assets.claude.ai"),
  "Widget CSP must allow Claude host fonts.",
);
assert(
  typeof content?._meta?.ui?.domain === "string" &&
    content._meta.ui.domain.endsWith(".claudemcpcontent.com"),
  "Widget must declare a Claude MCP App host domain.",
);
assert(
  !content?._meta?.ui?.csp?.connectDomains?.includes("wss://api.x.ai"),
  "Account widget CSP must not require Grok realtime — private voice is OpenAI Realtime.",
);
assert(
  !content?._meta?.ui?.csp?.connectDomains?.includes("https://api.x.ai"),
  "Account widget CSP must not require xAI hosts for private voice.",
);

const prompts = await jsonRpc("prompts/list");
assert(
  Array.isArray(prompts.result.prompts) && prompts.result.prompts.length >= 3,
  "MCP prompts/list must advertise reviewer prompts.",
);
assert(
  prompts.result.prompts.some((prompt) => prompt?.name === "create_first_voice_agent"),
  "MCP prompts/list must advertise create_first_voice_agent.",
);

const serverCard = await request("/mcp/server-card");
assert(serverCard.response.status === 200, "MCP server card must return HTTP 200.");
assert(
  serverCard.body &&
    typeof serverCard.body === "object" &&
    serverCard.body.websiteUrl === origin &&
    serverCard.body.remotes?.[0]?.url === `${origin}/mcp` &&
    serverCard.body.authentication?.oauth?.authorizationUrl === `${origin}/mcp/oauth/authorize` &&
    serverCard.body.authentication?.oauth?.tokenUrl === `${origin}/mcp/oauth/token`,
  "MCP server card must advertise one coherent issuer, remote, and OAuth origin.",
);

console.log(`ChatGPT App release probe passed for ${origin}.`);
