# BotBound ChatGPT App

## Product contract

**Meet the user in ChatGPT, create a real BotBound account if they are new, then help them build their first Bot.**

BotBound is not an anonymous demo surface and not a repo-embedded voice SDK. A connected user can create, read, refine, list, privately rehearse, and inspect agents that belong to their BotBound workspace. Confirmed Training writes land in BotBound after the Apps toggle. The app can also return aggregate operational status across agents, assigned phone numbers, calling, texting, and email without returning customer identities or communication content.

```text
ChatGPT conversation
-> BotBound OAuth (signup or sign in)
-> confirmed first agent draft
-> private voice or text rehearsal
-> optional Training that lands in BotBound
-> numbers, live calls, and launch in BotBound
```

## What ChatGPT owns

- Conversational discovery of the user's first-agent job.
- Turning a natural-language request into a structured customization profile.
- Collecting explicit confirmation before a private draft is created or changed.
- Private voice simulation of a saved draft.
- Privacy-minimized, read-only workspace summaries for status questions.

## What BotBound owns

- Tenant isolation and account ownership.
- Entitlement and capacity checks.
- Agent profile normalization and prompt compilation.
- Training sources, phone numbers, integrations, business hours, compliance, billing, and launch.
- Every external action and every lifecycle transition beyond draft and simulation.
- Customer records, message bodies, transcripts, recordings, provider credentials, and raw operational data.

## Public endpoints

| Endpoint                                                      | Purpose                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------- |
| `https://botbound.app/mcp`                                    | Streamable HTTP MCP endpoint                                  |
| `https://botbound.app/.well-known/oauth-protected-resource`   | OAuth protected-resource metadata                             |
| `https://botbound.app/.well-known/oauth-authorization-server` | BotBound authorization-server metadata                        |
| `https://botbound.app/mcp/oauth/authorize`                    | OAuth authorization and consent screen                        |
| `https://botbound.app/mcp/oauth/token`                        | OAuth authorization-code and refresh-token exchange           |
| `https://botbound.app/chatgpt-app-privacy.html`               | App-specific public privacy notice                            |
| `https://botbound.app/mcp-privacy.html`                       | Shared MCP connector privacy notice (Claude, ChatGPT, Cursor) |
| `https://botbound.app/claude-connector.html`                  | Claude Connector public documentation                         |
| `https://botbound.app/cursor-plugin.html`                     | Cursor plugin public documentation                            |

## Customization profile

Every client edits the same bounded canonical profile:

```text
Identity: name, business, role, tone
Mission: primary goal, success criteria
Behavior: rules, prohibited topics, intended actions, escalation policy
Training facts: account-holder summary
Lifecycle: draft
```

See `docs/AGENT_CUSTOMIZATION_ARCHITECTURE.md` for the client/domain boundary.

## Tool contract

| Tool                             | Scope           | Effect                                                                                                                                                      |
| -------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prepare_call`                   | `calls.prepare` | Saves an immutable, tenant-owned non-marketing service/callback proposal. Returns an authenticated review link; does not dispatch.                          |
| `get_call_status`                | `calls.read`    | Reads that proposal's placement receipt without recipient details or transcripts.                                                                           |
| `create_agent_draft`             | `agents.write`  | Creates a confirmed, private, unlaunched draft.                                                                                                             |
| `get_agent_draft`                | `agents.read`   | Reads a private draft.                                                                                                                                      |
| `update_agent_draft`             | `agents.write`  | Applies a confirmed private customization update.                                                                                                           |
| `start_private_voice_simulation` | `demo.voice`    | Starts a short, tool-free private simulation.                                                                                                               |
| `list_botbound_agents`           | `agents.read`   | Lists the connected user's agents.                                                                                                                          |
| `get_botbound_workspace_summary` | `agents.read`   | Returns tenant-scoped aggregate agent, phone-number, recent activity, unread, connection, activation, and subscription status without raw customer content. |
| `get_botbound_agent_status`      | `agents.read`   | Returns one agent's next step and BotBound links without phone numbers or customer content.                                                                 |
| `run_private_agent_turn`         | `demo.voice`    | Confirmed private text rehearsal of an owned agent. Not a live call.                                                                                        |
| `get_agent_coaching_brief`       | `agents.read`   | Owner-authored Training facts and rules. Never customer communications.                                                                                     |
| `train_botbound_agent`           | `agents.write`  | Confirmed fact or rule that lands in Training after the Apps toggle.                                                                                        |

### Non-goals for this transport

- No phone-number purchase or attachment.
- No inbound or outbound calling from the MCP client.
- No messaging, email, calendar, CRM, or payment mutations.
- No call recordings, transcripts, message bodies, customer identities, or other raw customer-data access.
- No agent launch.
- No autonomous external action from an intended-action field.
- No repo-embedded voice SDK.

### Call review

Claude, ChatGPT, and Cursor use the same two call tools and the same browser review.
Connect at `https://botbound.app/mcp`; grant `calls.prepare` and `calls.read` explicitly
when requested. Existing grants and omitted-scope defaults do not gain these scopes.
Use a personal or business Bot with a paid Calls plan and connected line.
The internal plan ID `personal` now identifies paid BotBound Personal. Unpaid draft accounts cannot place live calls; current paid entitlement and line ownership determine eligibility.

`prepare_call` requires a request UUIDv4, Bot ID, E.164 US number, instruction,
and `service_or_requested` or `callback` purpose. Retries reuse the UUID. Changed payloads
under that UUID conflict. The proposal expires after 24 hours. Open the returned review URL,
check the immutable details, choose the recipient's granted permission, and select **Place call**.
Only the authenticated workspace route places the call; the MCP credential cannot approve it.
It rechecks the saved payload and uses the existing durable outbound request, funding,
recipient permission, quiet-hours, and carrier reconciliation path.

Reviewed calling covers United States callers and recipients with captured permission.
`BOTBOUND_NON_MARKETING_OUTBOUND_ENABLED=true` enables this path independently of general
outbound. Eligibility depends on the call's non-marketing purpose, not the Bot's audience.
Marketing and campaigns remain under their existing separate gates. A client-selected
purpose or existing-client label does not establish recipient permission.

Use `get_call_status` to reconcile the same request. `accepted` means carrier
acceptance, and `completed` means a terminal call receipt; neither proves that the requested
appointment or other real-world task succeeded. Real OAuth and approved call evidence in
each host is required before claiming end-to-end client certification.

## Required production environment variables

Configure these in the Render API secret store. Local development and previews use dedicated sandbox values; do not export production credentials into a checkout.

```bash
APP_URL=https://botbound.app
MCP_OAUTH_TOKEN_PEPPER=
OPENAI_API_KEY_CHATKIT=
OPENAI_API_KEY=
```

There is no guest MCP transport or guest signing secret. Every production tool call requires an account-bound OAuth access token.

## ChatGPT registration

Use Client Identifier Metadata Document registration for ChatGPT. The shared `/mcp` server also exposes Dynamic Client Registration for Claude and Cursor; do not point the ChatGPT dashboard at DCR. The exact production ChatGPT registration is recorded in `docs/CHATGPT_APP_DASHBOARD_CONFIG.md`. Claude directory copy lives in `docs/CLAUDE_CONNECTOR.md`.

## Release verification

Run the public, unauthenticated protocol probe against the deployed environment:

```bash
node scripts/check-chatgpt-app-release.mjs --url https://botbound.app
```

The probe verifies protected-resource discovery, authorization-server discovery, PKCE S256 and CIMD support, MCP initialization identity `botbound`, the tool inventory, prompts, the account-bound widget resource, Claude host domain metadata, privacy pages, Cursor plugin docs, and the widget's explicit realtime CSP domain. It does not substitute for a real OAuth reviewer flow.

## Private rollout and App Directory readiness

1. Run the release probe against production.
2. Test OAuth with a real BotBound account.
3. Create a reviewer account with sample agents, a stable password, and no MFA.
4. Exercise first-agent create, update, private simulation, list, aggregate workspace summary, coaching brief, and negative safety prompts from `docs/CHATGPT_APP_SUBMISSION.md`.
5. Verify that the workspace summary returns only aggregates and connection state—never customer identifiers, communication bodies, transcripts, recordings, or credentials.
6. Capture evidence of OAuth, draft creation, customization, simulation, workspace visibility, and the unlaunched state.
7. Submit the account-bound version for review only after production checks pass.

The server identity and tool names use `botbound`. Legacy `*_wireline_*` tool names stay callable as hidden aliases for existing clients and are not listed. `https://trywireline.com/mcp` remains compatibility-only for existing registrations during issuer migration and is not published for new connections.
