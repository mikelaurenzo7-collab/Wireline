/**
 * Shared account-bound MCP contracts.
 *
 * Guest/demo token signing and the unauthenticated widget were retired. The
 * production `/mcp` transport requires OAuth and exposes tenant-bound
 * first-agent draft, rehearsal, Training, list, status, and aggregate-summary tools.
 */
export const CHATGPT_MCP_RESOURCE_URI = "ui://widget/wireline-agent-launch-v1.html";
export const MCP_SCOPES = ["agents.read", "agents.write", "demo.voice"] as const;
export type McpScope = (typeof MCP_SCOPES)[number];
