# Wireline ChatGPT App — Dashboard Configuration

## App identity

- **Display name:** `Wireline`
- **Subtitle:** `Build phone agents`
- **Category:** `BUSINESS`
- **Website:** `https://trywireline.com`
- **Support:** `support@trywireline.com`
- **Privacy notice:** `https://trywireline.com/chatgpt-app-privacy.html`
- **Hosted logo:** `https://trywireline.com/wireline-chatgpt-app-icon.svg`
- **Dashboard upload asset:** use the square PNG generated from `public/wireline-chatgpt-app-icon.svg` when the form requires a file upload rather than a URL.

The dedicated ChatGPT icon is intentionally simpler than the full-size Wireline artwork so the connected-W mark stays clear at directory and composer avatar sizes.

## App registration

- **Registration method:** Client Identifier Metadata Document (CIMD)
- **CIMD client metadata URL:** `https://chatgpt.com/oauth/7i4vMCsl-J2L/client.json`
- **ChatGPT callback URL:** `https://chatgpt.com/connector/oauth/7i4vMCsl-J2L`
- **Authorization server base:** `https://trywireline.com`
- **Authorization URL:** `https://trywireline.com/mcp/oauth/authorize`
- **Token URL:** `https://trywireline.com/mcp/oauth/token`
- **Resource:** `https://trywireline.com/mcp`
- **MCP server URL:** `https://trywireline.com/mcp`

These identifiers belong to the currently approved Developer Mode connection. Do not replace them with generic placeholders when preparing the production submission. If OpenAI regenerates the approved app identifier in the dashboard, update this document and `chatgpt-app-submission.json` together before rescanning tools.

## Scopes

- `agents.read`
- `agents.write`
- `demo.voice`

These match `MCP_SCOPES` declared by the Wireline MCP server.

## What not to configure

- Do **not** switch to Dynamic Client Registration.
- The Registration URL panel may show a generic placeholder when DCR is unavailable. It is not used by CIMD and must not be set to an invented Wireline endpoint.
- OIDC is not required for V1. Leave OIDC disabled unless Wireline later implements a real OpenID configuration and userinfo endpoint.
- Do **not** create static `MCP_OAUTH_ALLOWED_CLIENT_IDS` or `MCP_OAUTH_ALLOWED_REDIRECT_URIS` values for this ChatGPT CIMD connection. ChatGPT identifies its client through the hosted metadata URL, and Wireline validates the declared `chatgpt.com/connector/oauth/...` callback.

## Required Wireline Vercel configuration

| Variable | Required | Notes |
| --- | --- | --- |
| `APP_URL` | Yes | `https://trywireline.com` |
| `MCP_DEMO_STATE_SECRET` | Yes | Random, at least 32 characters; signs one-hour guest previews. |
| `MCP_OAUTH_TOKEN_PEPPER` | Yes | Random, at least 32 characters; hashes OAuth credentials. |
| `OPENAI_API_KEY_CHATKIT` | Yes for voice preview | Guest preview runtime key; isolate budget from customer runtime. |
| `OPENAI_API_KEY` | Fallback | Existing Wireline OpenAI runtime key. |

Never put runtime secret values into this document, the repository, screenshots, or the ChatGPT submission form.
