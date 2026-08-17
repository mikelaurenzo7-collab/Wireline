# Wireline Claude Connector

## Product contract

**Connect Wireline from Claude, describe the agent you need, create a real private draft, and inspect privacy-minimized workspace status.**

Claude, Claude Code, ChatGPT, and Cursor share one remote MCP server at `https://trywireline.com/mcp`. There is no separate Claude plugin package. Provider credentials, prompts, tenant enforcement, billing, and launch stay server-owned.

```text
Claude conversation
-> Wireline OAuth account connection
-> confirmed agent draft creation
-> private voice simulation
-> aggregate workspace visibility
-> full Training / testing / launch in Wireline
```

## Public endpoints

| Endpoint | Purpose |
| --- | --- |
| `https://trywireline.com/mcp` | Streamable HTTP MCP endpoint |
| `https://trywireline.com/.well-known/oauth-protected-resource` | OAuth protected-resource metadata |
| `https://trywireline.com/.well-known/oauth-authorization-server` | Wireline authorization-server metadata |
| `https://trywireline.com/mcp/oauth/authorize` | OAuth authorization and consent screen |
| `https://trywireline.com/mcp/oauth/token` | OAuth authorization-code and refresh-token exchange |
| `https://trywireline.com/mcp/oauth/register` | RFC 7591 dynamic client registration (Claude.ai, Cursor) |
| `https://trywireline.com/mcp/server-card` | MCP server card |
| `https://trywireline.com/.well-known/mcp/catalog.json` | MCP catalog |
| `https://trywireline.com/claude-connector.html` | Public connector documentation |
| `https://trywireline.com/mcp-privacy.html` | Connector-specific public privacy notice |

## Authentication

| Client | Registration | Callback |
| --- | --- | --- |
| Claude.ai / Claude.com | OAuth DCR (`oauth_dcr`) | `https://claude.ai/api/mcp/auth_callback` and org-scoped equivalents |
| Claude Code | CIMD (`oauth_cimd`) at `https://claude.ai/oauth/claude-code-client-metadata` | `http://localhost/callback` and `http://127.0.0.1/callback` with port ignored |
| ChatGPT | CIMD on chatgpt.com | `https://chatgpt.com/connector/oauth/...` |
| Cursor | OAuth DCR | Cursor-operated callbacks in `src/lib/mcp-client-registry.ts` |

Authorization-server metadata advertises both `client_id_metadata_document_supported: true` and `token_endpoint_auth_methods_supported: ["none"]` so Claude can select CIMD. DCR remains available for hosted Claude and Cursor. PKCE S256 is required. Refresh tokens are issued; `offline_access` is intentionally absent from `scopes_supported` so Claude does not always request it.

Unauthenticated clients may `initialize`, `tools/list`, `prompts/list`, and `resources/list`. Protected `tools/call` returns HTTP `401` with `WWW-Authenticate: Bearer error="invalid_token"` (or `403` / `insufficient_scope` for step-up). Do not wrap that refusal in a `200` JSON-RPC `isError` result. Claude will not show the Connect card.

The consent screen shows the connecting app name and the relying-party hostname. Loopback callbacks include an extra local-address warning.

## Tool contract

Same six tools as the ChatGPT App. Every tool has `title`, `readOnlyHint`, `destructiveHint`, and `openWorldHint`. Create and update require explicit confirmation. Private voice is tool-free. Workspace summary is aggregate only.

Prompts: `create_after_hours_receptionist`, `refine_draft_boundaries`, `inspect_workspace_status`.

## MCP App widget

The agent-draft widget is dual-host:

- MIME `text/html;profile=mcp-app`
- `_meta.ui` for Claude (borderless, host CSS variables, `domain` = sha256(server URL).slice(0, 32) + `.claudemcpcontent.com`, CSP `resourceDomains: ["https://assets.claude.ai"]`, microphone permission)
- `_meta["openai/..."]` for ChatGPT
- `ui/open-link` / `window.openai.openExternal` for **Open in Wireline**, allowlisted origin `https://trywireline.com`

## Directory vs custom vs plugin

- **Directory listing:** remote MCP server + MCP App, submitted at `https://claude.ai/admin-settings/directory/submissions/new`. Requires a Team or Enterprise org and Owner/Directory permission.
- **Custom connector:** any Claude user can add `https://trywireline.com/mcp` from Settings → Connectors while the listing is in review.
- **Plugin / MCPB:** not the submission type for this server. Skills are not a standalone directory type.

## Cursor leftover

Cursor already registers against the same `/mcp` server. Marketplace listing, a Cursor-specific plugin package, and Cursor screenshot capture are out of scope for this Claude-first pass.

## Verification

```bash
node scripts/check-chatgpt-app-release.mjs --url https://trywireline.com
```

The shared probe checks discovery, CIMD/PKCE, initialize identity `wireline`, the six-tool inventory, widget MIME/CSP, Claude host domain, prompts, privacy pages, and the server card. It does not substitute for a real OAuth reviewer flow in Claude.
