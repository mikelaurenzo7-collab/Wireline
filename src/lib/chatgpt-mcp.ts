/**
 * Shared account-bound MCP contracts.
 *
 * Guest/demo token signing and the unauthenticated widget were retired. The
 * production `/mcp` transport requires OAuth and exposes tenant-bound
 * first-agent draft, rehearsal, Training, list, status, and aggregate-summary tools.
 */
export const CHATGPT_MCP_RESOURCE_URI = "ui://widget/wireline-agent-launch-v1.html";
/** Existing clients that omit scope never acquire a newly added permission. */
export const MCP_DEFAULT_SCOPES = ["agents.read", "agents.write", "demo.voice"] as const;
export const MCP_SCOPES = [...MCP_DEFAULT_SCOPES, "calls.prepare", "calls.read"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];

/** Omitted scope preserves old clients; new authority must be named at consent. */
export function requestedMcpScopes(value: unknown): McpScope[] {
  if (value === undefined) return [...MCP_DEFAULT_SCOPES];
  if (typeof value !== "string") return [];
  return [
    ...new Set(
      value
        .split(/\s+/)
        .filter((scope): scope is McpScope => (MCP_SCOPES as readonly string[]).includes(scope)),
    ),
  ];
}
