const argumentIndex = process.argv.findIndex((argument) => argument === "--url");
const explicitUrl = argumentIndex >= 0 ? process.argv[argumentIndex + 1] : "";
const baseUrl = (explicitUrl || process.env.APP_URL || "").trim().replace(/\/+$/, "");

if (!baseUrl) {
  throw new Error("Set APP_URL or pass --url https://trywireline.com to probe the ChatGPT App release surface.");
}

let origin;
try {
  origin = new URL(baseUrl).origin;
} catch {
  throw new Error("APP_URL must be a valid absolute URL.");
}

const accountWidgetUri = "ui://widget/wireline-agent-draft-v2.html";
const expectedTools = new Set([
  "create_agent_draft",
  "get_agent_draft",
  "update_agent_draft",
  "start_private_voice_simulation",
  "list_wireline_agents",
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
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  return { response, body };
}

async function jsonRpc(method, params = {}, id = method) {
  const { response, body } = await request("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });
  assert(response.status === 200, `${method}: expected HTTP 200, received ${response.status}.`);
  assert(body && typeof body === "object" && !Array.isArray(body), `${method}: expected JSON-RPC response.`);
  assert(!body.error, `${method}: ${body.error?.message || "MCP returned an error."}`);
  assert(body.result, `${method}: MCP result is missing.`);
  return { response, result: body.result };
}

const protectedResource = await request("/.well-known/oauth-protected-resource");
assert(protectedResource.response.status === 200, "Protected-resource discovery must return HTTP 200.");
assert(
  (protectedResource.response.headers.get("cache-control") || "").toLowerCase().includes("no-store"),
  "Protected-resource discovery must set Cache-Control: no-store.",
);
assert(
  protectedResource.body && typeof protectedResource.body === "object" && !Array.isArray(protectedResource.body),
  "Protected-resource discovery must return JSON.",
);

const authorizationServer = await request("/.well-known/oauth-authorization-server");
assert(authorizationServer.response.status === 200, "Authorization-server discovery must return HTTP 200.");
assert(
  (authorizationServer.response.headers.get("cache-control") || "").toLowerCase().includes("no-store"),
  "Authorization-server discovery must set Cache-Control: no-store.",
);
assert(
  authorizationServer.body && typeof authorizationServer.body === "object" && !Array.isArray(authorizationServer.body),
  "Authorization-server discovery must return JSON.",
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

const initialized = await jsonRpc("initialize", {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "wireline-release-probe", version: "1.0.0" },
});
assert(initialized.result.serverInfo?.name === "wireline-chatgpt", "MCP server identity is not Wireline ChatGPT.");

const tools = await jsonRpc("tools/list");
const toolNames = new Set((tools.result.tools || []).map((tool) => tool?.name));
for (const name of expectedTools) assert(toolNames.has(name), `MCP tool missing: ${name}.`);
for (const tool of tools.result.tools || []) {
  assert(Array.isArray(tool.securitySchemes) && tool.securitySchemes.length > 0, `${tool.name}: OAuth security scheme is missing.`);
}

const resources = await jsonRpc("resources/list");
assert(
  (resources.result.resources || []).some((resource) => resource?.uri === accountWidgetUri),
  "Account-bound widget resource is missing.",
);

const resource = await jsonRpc("resources/read", { uri: accountWidgetUri });
const content = resource.result.contents?.[0];
assert(content?.uri === accountWidgetUri, "Account-bound widget resource did not resolve correctly.");
assert(content?.mimeType === "text/html;profile=mcp-app", "Widget resource MIME type is incorrect.");
assert(typeof content?.text === "string" && content.text.includes("Wireline agent draft"), "Widget HTML is missing or malformed.");
assert(
  content?._meta?.ui?.csp?.connectDomains?.includes("https://api.openai.com"),
  "Widget CSP must explicitly allow the realtime API domain.",
);

console.log(`ChatGPT App release probe passed for ${origin}.`);
