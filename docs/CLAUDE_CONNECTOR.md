# BotBound Claude Connector

## Product contract

**Meet the user in Claude, create a real BotBound account if they are new, then help them build their first Bot.**

Claude, Claude Code, ChatGPT, and Cursor share one remote MCP server at `https://botbound.me/mcp`. There is no separate Claude plugin package and no repo-embedded voice SDK. Cursor Directory packaging lives at the repository root (`.mcp.json`, `plugin.json`, `mcp.json`). Provider credentials, prompts, tenant enforcement, billing, and launch stay server-owned.

```text
Claude conversation
-> BotBound OAuth (signup or sign in)
-> confirmed first agent draft
-> private voice or text rehearsal
-> optional Training that lands in BotBound
-> numbers, live calls, and launch in BotBound
```

## Public endpoints

| Endpoint | Purpose |
| --- | --- |
| `https://botbound.me/mcp` | Streamable HTTP MCP endpoint |
| `https://botbound.me/.well-known/oauth-protected-resource` | OAuth protected-resource metadata |
| `https://botbound.me/.well-known/oauth-authorization-server` | BotBound authorization-server metadata |
| `https://botbound.me/mcp/oauth/authorize` | OAuth authorization and consent screen |
| `https://botbound.me/mcp/oauth/token` | OAuth authorization-code and refresh-token exchange |
| `https://botbound.me/mcp/oauth/register` | RFC 7591 dynamic client registration (Claude.ai, Cursor) |
| `https://botbound.me/mcp/server-card` | MCP server card |
| `https://botbound.me/.well-known/mcp/catalog.json` | MCP catalog |
| `https://botbound.me/claude-connector.html` | Public connector documentation |
| `https://botbound.me/mcp-privacy.html` | Connector-specific public privacy notice |

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

Same ten tools as the ChatGPT App and Cursor plugin. Every tool has `title`, `readOnlyHint`, `destructiveHint`, and `openWorldHint`. Create, update, private text rehearsal, and Training writes require explicit confirmation. Training writes also require the Apps toggle. Private voice is tool-free. Workspace summary is aggregate only. Agent status never returns phone numbers.

Prompts: `create_first_voice_agent`, `create_after_hours_receptionist`, `refine_draft_boundaries`, `inspect_workspace_status`, `rehearse_agent_reply`, `coach_agent_training`.

## MCP App widget

The agent-draft widget is dual-host:

- MIME `text/html;profile=mcp-app`
- `_meta.ui` for Claude (borderless, host CSS variables, `domain` = sha256(server URL).slice(0, 32) + `.claudemcpcontent.com`, CSP `resourceDomains: ["https://assets.claude.ai"]`, microphone permission)
- `_meta["openai/..."]` for ChatGPT
- `ui/open-link` / `window.openai.openExternal` for **Open in BotBound**, allowlisted origin `https://botbound.me`

## Directory vs custom vs plugin

- **Directory listing:** remote MCP server + MCP App, submitted at `https://claude.ai/admin-settings/directory/submissions/new`. Requires a Team or Enterprise org and Owner/Directory permission.
- **Custom connector:** any Claude user can add `https://botbound.me/mcp` from Settings → Connectors while the listing is in review.
- **Plugin / MCPB:** not the submission type for this server. Skills are not a standalone directory type.

## Cursor Directory

Cursor installs the same `/mcp` server. The Cursor Directory package and submission packet live in `docs/CURSOR_PLUGIN.md` and `docs/CURSOR_PLUGIN_SUBMISSION.md`.

## Verification

```bash
node scripts/check-chatgpt-app-release.mjs --url https://botbound.me
```

The shared probe checks discovery, CIMD/PKCE, initialize identity `wireline`, the tool inventory, widget MIME/CSP, Claude host domain, prompts, privacy pages, Cursor plugin docs, and the server card. It does not substitute for a real OAuth reviewer flow in Claude.

Existing clients registered against `https://trywireline.com/mcp` remain a compatibility concern during issuer migration. Do not publish that legacy origin for new connections, and do not remove it from runtime compatibility handling until registered-client traffic has been verified at zero.
