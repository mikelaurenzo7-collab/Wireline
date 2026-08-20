import { createHash } from "node:crypto";

import { MCP_SCOPES } from "./chatgpt-mcp";
import { mcpIssuer, mcpResourceUrl } from "./mcp-oauth-security";

/** Stable protocol/package name retained for existing connected clients. */
export const MCP_SERVER_NAME = "wireline";
export const MCP_SERVER_TITLE = "BotBound";
export const MCP_SERVER_VERSION = "2.4.0";

export const MCP_WEBSITE_URL = "https://botbound.me";
export const MCP_DOCUMENTATION_URL = "https://botbound.me/claude-connector.html";
export const MCP_PRIVACY_URL = "https://botbound.me/mcp-privacy.html";
// The asset filename is a stable compatibility path; the public host is BotBound.
export const MCP_ICON_URL = "https://botbound.me/wireline-chatgpt-app-icon.svg";
export const MCP_SUPPORT_URL = "https://botbound.me/support";

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
      "Shows the first BotBound Bot draft created from this chat, a private voice simulation, and a secure path to continue in BotBound.",
    "openai/widgetCSP": {
      connect_domains: ["https://api.openai.com"],
      resource_domains: [],
      // botbound.me is the forward public identity. Keep the legacy callback
      // host until external OAuth/provider registrations complete their cutover.
      redirect_domains: ["https://botbound.me", "https://trywireline.com"],
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
    // Public company/product navigation is independent of the temporarily
    // compatibility-pinned OAuth issuer and MCP resource endpoints below.
    websiteUrl: MCP_WEBSITE_URL,
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
      "com.trywireline/support": MCP_SUPPORT_URL,
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
