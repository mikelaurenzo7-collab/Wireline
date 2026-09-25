# BotBound Cursor Directory submission

Submit the public GitHub repository at [cursor.directory/plugins/new](https://cursor.directory/plugins/new). The form auto-detects `.mcp.json`, `skills/*/SKILL.md`, `agents/*.md`, and `rules/*.mdc`. You submit; this packet is the reviewer contract for first-agent acquisition, not a repo voice SDK.

## Listing identity

- **Name:** BotBound
- **GitHub:** `https://github.com/mikelaurenzo7-collab/Wireline`
- **MCP URL:** `https://botbound.app/mcp`
- **Docs:** `https://botbound.app/cursor-plugin.html`
- **Privacy:** `https://botbound.app/mcp-privacy.html`
- **Icon:** `https://botbound.app/botbound-icon-512.png`
- **Support:** `support@botbound.app`
- **One-click install:** `cursor://anysphere.cursor-deeplink/mcp/install?name=botbound&config=eyJ1cmwiOiJodHRwczovL2JvdGJvdW5kLmFwcC9tY3AifQ==`

## Directory form copy

Paste these values if the auto-detect form asks for them. Do not invent a second MCP URL or a static OAuth client id.

- **Description:** Connect a BotBound account in Cursor, describe a Bot, create a private unlaunched draft, run a short tool-free simulation, and inspect aggregate workspace status without customer content.
- **Install docs:** `https://botbound.app/cursor-plugin.html`
- **Config:** `{ "url": "https://botbound.app/mcp" }` with no `headers` and no `auth` secrets.

## OAuth callbacks (do not swap these)

`botbound.app` is the **authorization server**. Cursor is the **OAuth client**. Do not register `https://botbound.app/...` as Cursor's redirect URI. That would send the authorization code to BotBound instead of Cursor, and Connect would fail.

| Role                                     | URL                                                | Register?                                                                                       |
| ---------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| MCP / OAuth server (what Cursor calls)   | `https://botbound.app/mcp`                          | Yes - this is the Directory MCP URL                                                             |
| BotBound login/consent return (our page) | `https://botbound.app/mcp/oauth/callback`           | Already owned by BotBound. Not a Cursor client redirect.                                        |
| Cursor desktop callback                  | `http://localhost:8787/callback`                   | Yes - keep in DCR allowlist. RFC 8252 loopback. Do not replace with the BotBound server origin. |
| Cursor web / Agents callback             | `https://www.cursor.com/agents/mcp/oauth/callback` | Yes — keep in DCR allowlist                                                                     |
| Older Cursor protocol callback           | `cursor://anysphere.cursor-mcp/oauth/callback`     | Yes — keep in DCR allowlist                                                                     |

Do **not** put Cursor's localhost callback in `MCP_OAUTH_ALLOWED_REDIRECT_URIS`. That env list is ChatGPT CIMD only. Cursor uses DCR, which already allowlists the three Cursor redirects in `src/lib/mcp-client-registry.ts`.

## Scan expectations

The directory clones the repo and auto-reviews plugin components. Keep those files free of credentials, exploit payloads, live-dial instructions, and repo-SDK claims. The plugin only points at the remote OAuth server and teaches first-agent creation.

## Reviewer flow

1. Install BotBound from the listing, the one-click Cursor link, or add `https://botbound.app/mcp`.
2. Complete OAuth. Create a BotBound account if needed.
3. Prompt: create my first after-hours receptionist and confirm.
4. Prompt: privately rehearse "Do you have Saturday appointments?"
5. Prompt: what is the next step in BotBound?
6. Confirm the client does not place a live call, return customer phone numbers, or claim to embed BotBound in a repo.

`https://trywireline.com/mcp` is retained only for already-registered client compatibility during issuer migration. It is not the URL for a new Cursor listing or install link.

Canonical product doctrine: [CURSOR_PLUGIN.md](./CURSOR_PLUGIN.md).
