# Wireline Cursor plugin

## Product contract

**Meet the user in Cursor, create a real Wireline account if they are new, then help them build their first voice agent.**

Cursor, ChatGPT, Claude, and Claude Code share one remote MCP server at `https://trywireline.com/mcp`. The Cursor Directory package in this repository is discovery and install metadata only. It is not a software development kit for embedding Wireline voice agents in another repository. Provider credentials, prompts, tenant enforcement, billing, launch, and live calling stay server-owned.

```text
Cursor Agent
-> Wireline OAuth (signup or sign in)
-> confirmed first agent draft
-> private rehearsal (text or voice)
-> optional Training that lands in Wireline
-> live numbers, calling, messaging, and launch in Wireline
```

## What Cursor owns

- Discovering the remote server from `.mcp.json` / `mcp.json`.
- OAuth against Cursor-operated callbacks already allowlisted in `src/lib/mcp-client-registry.ts`.
- Conversational first-agent drafting, confirmation, and private rehearsal prompts.

## What Wireline owns

- Account creation, tenant isolation, entitlements, and spend guards.
- Agent profile normalization and prompt compilation.
- Training, Wire, Studio, phone numbers, live calls, messaging, billing, and launch.
- Customer records, transcripts, recordings, and provider credentials.

## Cursor Directory package

cursor.directory auto-detects Open Plugins paths from the public GitHub repository:

| Component | Path |
| --- | --- |
| Plugin manifest | `plugin.json` |
| Open Plugins MCP | `mcp.json` (`type: streamable-http`) |
| Directory MCP | `.mcp.json` (`url` only, no secrets) |
| Skill | `skills/wireline-voice-agent/SKILL.md` |
| Rule | `rules/wireline-mcp.mdc` |
| Agent | `agents/wireline.md` |

Submit the public GitHub repository at [cursor.directory/plugins/new](https://cursor.directory/plugins/new). Follow [CURSOR_PLUGIN_SUBMISSION.md](./CURSOR_PLUGIN_SUBMISSION.md). Do not put API keys, `headers`, or `auth` client secrets in the plugin files. Cursor handles OAuth.

Public documentation: `https://trywireline.com/cursor-plugin.html`.

## Tool contract

Same tools as ChatGPT and Claude:

| Tool | Scope | Effect |
| --- | --- | --- |
| `create_agent_draft` | `agents.write` | Confirmed private unlaunched draft. First-agent conversion. |
| `get_agent_draft` | `agents.read` | Reads a private draft. |
| `update_agent_draft` | `agents.write` | Confirmed private draft update. |
| `start_private_voice_simulation` | `demo.voice` | Tool-free private voice rehearsal. |
| `list_wireline_agents` | `agents.read` | Lists the connected user's agents. |
| `get_wireline_workspace_summary` | `agents.read` | Aggregate counts only. |
| `get_wireline_agent_status` | `agents.read` | Next step and Wireline links. No phone numbers or customer content. |
| `run_private_agent_turn` | `demo.voice` | Confirmed private text rehearsal. Not a live call. |
| `get_agent_coaching_brief` | `agents.read` | Owner-authored Training facts and rules. |
| `train_wireline_agent` | `agents.write` | Confirmed fact or rule that lands in Training after the Apps toggle. |

### Non-goals

- No phone-number purchase or attachment.
- No inbound or outbound calling from the MCP client.
- No messaging, email, calendar, CRM, or payment mutations.
- No call recordings, transcripts, message bodies, or customer identities.
- No agent launch.
- No repo-embedded voice SDK.

Triggering an agent from Cursor means a private rehearsal of an agent the user owns. Live customer contact stays in Wireline.

## Authentication

Unauthenticated clients may `initialize`, `tools/list`, `prompts/list`, and `resources/list`. Protected `tools/call` returns HTTP `401` with `WWW-Authenticate: Bearer error="invalid_token"` so Cursor can show Connect.

Users without a session are sent to `/signup?redirect=/mcp/oauth/authorize...`. Existing users switch to Sign in on that screen. After account creation, the same redirect returns them to consent.

## Verification

```bash
node scripts/check-chatgpt-app-release.mjs --url https://trywireline.com
```

The shared probe checks discovery, the tool inventory, privacy pages, and `https://trywireline.com/cursor-plugin.html`. It does not substitute for a real OAuth flow in Cursor.
