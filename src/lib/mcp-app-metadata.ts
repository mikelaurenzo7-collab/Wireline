import { createHash } from "node:crypto";

import { MCP_SCOPES } from "./chatgpt-mcp";
import { mcpIssuer, mcpResourceUrl } from "./mcp-oauth-security";

export const MCP_SERVER_NAME = "wireline";
export const MCP_SERVER_TITLE = "Wireline";
export const MCP_SERVER_VERSION = "2.3.0";

export const MCP_DOCUMENTATION_URL = "https://trywireline.com/claude-connector.html";
export const MCP_PRIVACY_URL = "https://trywireline.com/mcp-privacy.html";
export const MCP_ICON_URL = "https://trywireline.com/wireline-chatgpt-app-icon.svg";
export const MCP_SUPPORT_EMAIL = "support@trywireline.com";

export function claudeMcpAppDomain(resourceUrl: string): string {
  return `${createHash("sha256").update(resourceUrl).digest("hex").slice(0, 32)}.claudemcpcontent.com`;
}

export function mcpUiResourceMeta(resourceUrl: string) {
  const domain = claudeMcpAppDomain(resourceUrl);
  return {
    ui: {
      prefersBorder: false,
      domain,
      permissions: ["microphone"],
      csp: {
        connectDomains: ["https://api.openai.com"],
        resourceDomains: ["https://assets.claude.ai"],
      },
    },
    "openai/widgetPrefersBorder": false,
    "openai/widgetDescription":
      "Shows a connected Wireline agent draft, private voice simulation, aggregate workspace status, and a secure path to continue configuration in Wireline.",
    "openai/widgetCSP": {
      connect_domains: ["https://api.openai.com"],
      resource_domains: [],
      redirect_domains: ["https://trywireline.com"],
    },
  };
}

export function mcpServerCard(req?: Parameters<typeof mcpIssuer>[0]) {
  const issuer = mcpIssuer(req);
  const resource = mcpResourceUrl(req);
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    name: "com.trywireline/mcp",
    title: MCP_SERVER_TITLE,
    version: MCP_SERVER_VERSION,
    description:
      "Create and refine a private, unlaunched Wireline voice-agent draft, run a short private simulation, and inspect privacy-minimized workspace status. Phone numbers, live calls, messaging, and launch stay in Wireline.",
    websiteUrl: issuer,
    repository: { url: "https://github.com/mikelaurenzo7-collab/Wireline", source: "github" },
    icons: [{ src: MCP_ICON_URL, mimeType: "image/svg+xml" }],
    remotes: [
      {
        type: "streamable-http",
        url: resource,
        headers: {},
      },
    ],
    authentication: {
      oauth: {
        authorizationUrl: `${issuer}/mcp/oauth/authorize`,
        tokenUrl: `${issuer}/mcp/oauth/token`,
        scopes: [...MCP_SCOPES],
      },
    },
    _meta: {
      "com.trywireline/docs": MCP_DOCUMENTATION_URL,
      "com.trywireline/privacy": MCP_PRIVACY_URL,
    },
  };
}

export function mcpCatalog(req?: Parameters<typeof mcpIssuer>[0]) {
  const issuer = mcpIssuer(req);
  return {
    items: [
      {
        url: `${issuer}/mcp/server-card`,
        name: "com.trywireline/mcp",
      },
    ],
  };
}
