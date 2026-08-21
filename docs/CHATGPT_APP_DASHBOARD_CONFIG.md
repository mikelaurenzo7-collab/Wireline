# BotBound ChatGPT App - Dashboard Configuration

## App identity

- **Display name:** `BotBound`
- **Subtitle:** `Build your first Bot`
- **Category:** `BUSINESS`
- **Website:** `https://botbound.me`
- **Support:** `support@trywireline.com`
- **Privacy notice:** `https://botbound.me/chatgpt-app-privacy.html`
- **Hosted logo:** `https://botbound.me/botbound-icon-512.png`
- **Dashboard upload asset:** use `public/botbound-icon-512.png` when the form requires a file upload rather than a URL.

The dedicated BotBound icon is designed to keep the robot-and-phone identity clear at directory and composer avatar sizes.

## App registration

- **Registration method:** Client Identifier Metadata Document (CIMD)
- **CIMD client metadata URL:** `https://chatgpt.com/oauth/7i4vMCsl-J2L/client.json`
- **ChatGPT callback URL:** `https://chatgpt.com/connector/oauth/7i4vMCsl-J2L`
- **Authorization server base:** `https://botbound.me`
- **Authorization URL:** `https://botbound.me/mcp/oauth/authorize`
- **Token URL:** `https://botbound.me/mcp/oauth/token`
- **Resource:** `https://botbound.me/mcp`
- **MCP server URL:** `https://botbound.me/mcp`

The CIMD and callback identifiers belong to the approved Developer Mode connection. The authorization server, token endpoint, resource, and MCP URL must move together as one issuer cutover. If OpenAI regenerates the approved app identifier in the dashboard, update this document and `chatgpt-app-submission.json` together before rescanning tools.

## Scopes

- `agents.read`
- `agents.write`
- `demo.voice`

These match `MCP_SCOPES` declared by the BotBound MCP server.

## What not to configure

- Do **not** switch to Dynamic Client Registration.
- The Registration URL panel may show a generic placeholder when DCR is unavailable. It is not used by CIMD and must not be set to an invented BotBound endpoint.
- OIDC is not required for V1. Leave OIDC disabled unless BotBound later implements a real OpenID configuration and userinfo endpoint.
- Do **not** create static `MCP_OAUTH_ALLOWED_CLIENT_IDS` or `MCP_OAUTH_ALLOWED_REDIRECT_URIS` values for this ChatGPT CIMD connection. ChatGPT identifies its client through the hosted metadata URL, and BotBound validates the declared `chatgpt.com/connector/oauth/...` callback.

## Required BotBound Vercel configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_URL` | Yes | `https://botbound.me` |
| `MCP_OAUTH_TOKEN_PEPPER` | Yes | Random, at least 32 characters; hashes OAuth credentials. |
| `OPENAI_API_KEY_CHATKIT` | Optional | Isolated key for account-bound private simulation; falls back to `OPENAI_API_KEY`. |
| `OPENAI_API_KEY` | Fallback | Existing BotBound OpenAI runtime key. |

Never put runtime secret values into this document, the repository, screenshots, or the ChatGPT submission form.

`https://trywireline.com` remains compatibility-only for the previously issued integration origin while traffic and registrations migrate. Do not mix its OAuth endpoints with the canonical BotBound resource in a single connection.
