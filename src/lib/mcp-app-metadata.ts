import { createHash } from "node:crypto";

import { MCP_SCOPES } from "./chatgpt-mcp";
import { mcpIssuer, mcpResourceUrl } from "./mcp-oauth-security";

/** Stable protocol/package name retained for existing connected clients. */
export const MCP_SERVER_NAME = "wireline";
export const MCP_SERVER_TITLE = "BotBound";
export const MCP_SERVER_VERSION = "2.4.0";

export const MCP_DOCUMENTATION_URL = "https://botbound.app/claude-connector.html";
export const MCP_PRIVACY_URL = "https://botbound.app/mcp-privacy.html";
export const MCP_ICON_URL = "https://botbound.app/botbound-icon-512.png";
export const MCP_SUPPORT_EMAIL = "support@botbound.app";

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
        connectDomains: [],
        resourceDomains: ["https://assets.claude.ai"],
      },
    },
    "openai/widgetPrefersBorder": false,
    "openai/widgetDescription":
      "Shows the first BotBound Bot draft created from this chat, a private voice simulation, and a secure path to continue in BotBound.",
    "openai/widgetCSP": {
      connect_domains: [],
      resource_domains: [],
      redirect_domains: ["https://botbound.app"],
    },
  };
}

export function mcpServerCard(req?: Parameters<typeof mcpIssuer>[0]) {
  const issuer = mcpIssuer(req);
  const resource = mcpResourceUrl(req);
  return {
    $schema: "https://static.modelcontextprotocol.io/schemas/mcp-server-card/v1.json",
    // Stable package identifier; visible title/description carry BotBound.
    name: "com.trywireline/mcp",
    title: MCP_SERVER_TITLE,
    version: MCP_SERVER_VERSION,
    description:
      "Create a BotBound account, build your first Bot from Cursor, ChatGPT, or Claude, privately rehearse it, and continue in BotBound. Live calls, numbers, and launch stay in BotBound.",
    websiteUrl: issuer,
    repository: { url: "https://github.com/mikelaurenzo7-collab/Wireline", source: "github" },
    icons: [{ src: MCP_ICON_URL, mimeType: "image/png" }],
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
