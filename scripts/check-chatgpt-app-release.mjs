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
  return { response, body, contentType };
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

const icon = await request("/wireline-chatgpt-app-icon.svg", { headers: { Accept: "image/svg+xml" } });
assert(icon.response.status === 200, "Dedicated ChatGPT app icon must return HTTP 200.");
assert(icon.contentType.includes("image/svg+xml"), "Dedicated ChatGPT app icon must be served as SVG.");
assert(typeof icon.body === "string" && icon.body.includes("<title id=\"title\">Wireline</title>"), "Dedicated ChatGPT app icon is malformed.");

const privacy = await request("/chatgpt-app-privacy.html", { headers: { Accept: "text/html" } });
assert(privacy.response.status === 200, "ChatGPT app privacy notice must return HTTP 200.");
assert(typeof privacy.body === "string" && privacy.body.includes("Information returned to ChatGPT"), "Privacy notice must disclose information returned to ChatGPT.");
assert(privacy.body.includes("not included in the model-visible conversation"), "Privacy notice must distinguish widget-only simulation credentials.");

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
const liveTools = tools.result.tools || [];
const liveToolNames = new Set(liveTools.map((tool) => tool?.name));
for (const name of expectedAnnotations.keys()) assert(liveToolNames.has(name), `MCP tool missing: ${name}.`);
assert(liveTools.length === expectedAnnotations.size, `Expected ${expectedAnnotations.size} MCP tools, received ${liveTools.length}.`);
for (const tool of liveTools) {
  assert(Array.isArray(tool.securitySchemes) && tool.securitySchemes.length > 0, `${tool.name}: OAuth security scheme is missing.`);
  assert(tool.outputSchema && typeof tool.outputSchema === "object", `${tool.name}: outputSchema is missing.`);
  const expected = expectedAnnotations.get(tool.name);
  assert(expected, `Unexpected MCP tool exposed: ${tool.name}.`);
  for (const [key, value] of Object.entries(expected)) {
    assert(typeof tool.annotations?.[key] === "boolean", `${tool.name}: ${key} must be an explicit boolean.`);
    assert(tool.annotations[key] === value, `${tool.name}: ${key} must be ${value}.`);
  }
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
