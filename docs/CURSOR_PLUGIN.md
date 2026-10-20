# BotBound Cursor plugin

## Product contract

**Meet the user in Cursor, create a real BotBound account if they are new, then help them build their first Bot.**

Cursor, ChatGPT, Claude, and Claude Code share one remote MCP server at `https://botbound.app/mcp`. The Cursor Directory package in this repository is discovery and install metadata only. It is not a software development kit for embedding BotBound Bots in another repository. Provider credentials, prompts, tenant enforcement, billing, launch, and live calling stay server-owned.

```text
Cursor Agent
-> BotBound OAuth (signup or sign in)
-> confirmed first agent draft
-> private rehearsal (text or voice)
-> optional Training that lands in BotBound
-> live numbers, calling, messaging, and launch in BotBound
```

## What Cursor owns

- Discovering the remote server from `.mcp.json` / `mcp.json`.
- OAuth against Cursor-operated callbacks already allowlisted in `src/lib/mcp-client-registry.ts`: `cursor://anysphere.cursor-mcp/oauth/callback`, `https://www.cursor.com/agents/mcp/oauth/callback`, and desktop `http://localhost:8787/callback`. `https://botbound.app` is the authorization server, not a Cursor client redirect.
- Conversational first-agent drafting, confirmation, and private rehearsal prompts.

## What BotBound owns

- Account creation, tenant isolation, entitlements, and spend guards.
- Agent profile normalization and prompt compilation.
- Training, Connections, Studio, phone numbers, live calls, messaging, billing, and launch.
- Customer records, transcripts, recordings, and provider credentials.

## Cursor Directory package

cursor.directory auto-detects Open Plugins paths from the public GitHub repository:

| Component        | Path                                   |
| ---------------- | -------------------------------------- |
| Plugin manifest  | `plugin.json`                          |
| Open Plugins MCP | `mcp.json` (`type: streamable-http`)   |
| Directory MCP    | `.mcp.json` (`url` only, no secrets)   |
| Skill            | `skills/wireline-voice-agent/SKILL.md` |
| Rule             | `rules/wireline-mcp.mdc`               |
| Agent            | `agents/wireline.md`                   |

Submit the public GitHub repository at [cursor.directory/plugins/new](https://cursor.directory/plugins/new). Follow [CURSOR_PLUGIN_SUBMISSION.md](./CURSOR_PLUGIN_SUBMISSION.md). Do not put API keys, `headers`, or `auth` client secrets in the plugin files. Cursor handles OAuth.

One-click install:

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=botbound&config=eyJ1cmwiOiJodHRwczovL2JvdGJvdW5kLmFwcC9tY3AifQ==
```

Public documentation: `https://botbound.app/cursor-plugin.html`.

## Tool contract

Same tools as ChatGPT and Claude:

| Tool                             | Scope          | Effect                                                               |
| -------------------------------- | -------------- | -------------------------------------------------------------------- |
| `create_agent_draft`             | `agents.write` | Confirmed private unlaunched draft. First-agent conversion.          |
| `get_agent_draft`                | `agents.read`  | Reads a private draft.                                               |
| `update_agent_draft`             | `agents.write` | Confirmed private draft update.                                      |
| `start_private_voice_simulation` | `demo.voice`   | Tool-free private voice rehearsal.                                   |
| `list_wireline_agents`           | `agents.read`  | Lists the connected user's agents.                                   |
| `get_wireline_workspace_summary` | `agents.read`  | Aggregate counts only.                                               |
| `get_wireline_agent_status`      | `agents.read`  | Next step and BotBound links. No phone numbers or customer content.  |
| `run_private_agent_turn`         | `demo.voice`   | Confirmed private text rehearsal. Not a live call.                   |
| `get_agent_coaching_brief`       | `agents.read`  | Owner-authored Training facts and rules.                             |
| `train_wireline_agent`           | `agents.write` | Confirmed fact or rule that lands in Training after the Apps toggle. |
| `prepare_call` | `calls.prepare` | Saves a non-marketing service/callback proposal for the user to review and place in BotBound. |
| `get_call_status` | `calls.read` | Reads the prepared call's placement status without recipient details or transcripts. |

Non-marketing calling uses the same server, explicit new OAuth scopes, and authenticated browser
review as Claude and ChatGPT. No Cursor-specific widget is required. The proposal is not
dispatch authority. The full contract, including paid voice, captured Illinois recipient
permission, 24-hour expiry, and retry behavior, is in `docs/CHATGPT_APP.md`.

### Non-goals

- No phone-number purchase or attachment.
- No inbound or outbound calling from the MCP client.
- No messaging, email, calendar, CRM, or payment mutations.
- No call recordings, transcripts, message bodies, or customer identities.
- No agent launch.
- No repo-embedded voice SDK.

Triggering an agent from Cursor means a private rehearsal of an agent the user owns. Live customer contact stays in BotBound.

## Authentication

Unauthenticated clients may `initialize`, `tools/list`, `prompts/list`, and `resources/list`. Protected `tools/call` returns HTTP `401` with `WWW-Authenticate: Bearer error="invalid_token"` so Cursor can show Connect.

Users without a session are sent to `/signin?redirect=/mcp/oauth/authorize...`. New users switch to Create account on that screen. After sign-in or account creation, the same redirect returns them to consent.

## Verification

```bash
node scripts/check-chatgpt-app-release.mjs --url https://botbound.app
```

The shared probe checks discovery, the tool inventory, privacy pages, and `https://botbound.app/cursor-plugin.html`. It does not substitute for a real OAuth flow in Cursor.

The `wireline` package, server, tool, and file identifiers are stable technical namespaces. `https://trywireline.com/mcp` remains a compatibility endpoint for existing registrations during the issuer migration; do not publish it for new installs.
