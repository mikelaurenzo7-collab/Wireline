# Wireline ChatGPT App

## Product contract

**Connect Wireline, describe the agent you need in ChatGPT, create a real private draft, and inspect privacy-minimized workspace status.**

Wireline is not an anonymous demo surface. A connected user can create, read, refine, list, and privately simulate agents that belong to their Wireline workspace. The app can also return aggregate operational status across agents, assigned phone numbers, calling, texting, and email without returning customer identities or communication content.

```text
ChatGPT conversation
-> Wireline OAuth account connection
-> confirmed agent draft creation
-> private voice simulation
-> aggregate workspace visibility
-> full Training / testing / launch in Wireline
```

## What ChatGPT owns

- Conversational discovery of the user's business need.
- Turning a natural-language request into a structured customization profile.
- Collecting explicit confirmation before a private draft is created or changed.
- Private voice simulation of a saved draft.
- Privacy-minimized, read-only workspace summaries for status questions.

## What Wireline owns

- Tenant isolation and account ownership.
- Entitlement and capacity checks.
- Agent profile normalization and prompt compilation.
- Training sources, phone numbers, integrations, business hours, compliance, billing, and launch.
- Every external action and every lifecycle transition beyond draft and simulation.
- Customer records, message bodies, transcripts, recordings, provider credentials, and raw operational data.

## Public endpoints

| Endpoint | Purpose |
| --- | --- |
| `https://trywireline.com/mcp` | Streamable HTTP MCP endpoint |
| `https://trywireline.com/.well-known/oauth-protected-resource` | OAuth protected-resource metadata |
| `https://trywireline.com/.well-known/oauth-authorization-server` | Wireline authorization-server metadata |
| `https://trywireline.com/mcp/oauth/authorize` | OAuth authorization and consent screen |
| `https://trywireline.com/mcp/oauth/token` | OAuth authorization-code and refresh-token exchange |
| `https://trywireline.com/chatgpt-app-privacy.html` | App-specific public privacy notice |

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

| Tool | Scope | Effect |
| --- | --- | --- |
| `create_agent_draft` | `agents.write` | Creates a confirmed, private, unlaunched draft. |
| `get_agent_draft` | `agents.read` | Reads a private draft. |
| `update_agent_draft` | `agents.write` | Applies a confirmed private customization update. |
| `start_private_voice_simulation` | `demo.voice` | Starts a short, tool-free private simulation. |
| `list_wireline_agents` | `agents.read` | Lists the connected user's agents. |
| `get_wireline_workspace_summary` | `agents.read` | Returns tenant-scoped aggregate agent, phone-number, recent activity, unread, connection, activation, and subscription status without raw customer content. |

### Non-goals for this transport

- No phone-number purchase or attachment.
- No inbound or outbound calling.
- No messaging, email, calendar, CRM, or payment mutations.
- No call recordings, transcripts, message bodies, customer identities, or other raw customer-data access.
- No agent launch.
- No autonomous external action from an intended-action field.

## Required Vercel environment variables

```bash
APP_URL=https://trywireline.com
MCP_OAUTH_TOKEN_PEPPER=
OPENAI_API_KEY_CHATKIT=
OPENAI_API_KEY=
```

`MCP_DEMO_STATE_SECRET` is legacy-only while the old guest handler remains mounted for compatibility; it is not used by account-bound production tools.

## ChatGPT registration

Use Client Identifier Metadata Document registration. Do not configure Dynamic Client Registration or OIDC for V1. The exact production registration is recorded in `docs/CHATGPT_APP_DASHBOARD_CONFIG.md`.

## Release verification

Run the public, unauthenticated protocol probe against the deployed environment:

```bash
node scripts/check-chatgpt-app-release.mjs --url https://trywireline.com
```

The probe verifies protected-resource discovery, authorization-server discovery, PKCE S256 and CIMD support, MCP initialization, the full six-tool inventory, the account-bound widget resource, and the widget's explicit realtime CSP domain. It does not substitute for a real OAuth reviewer flow.

## Private rollout and App Directory readiness

1. Run the release probe against production.
2. Test OAuth with a real Wireline account.
3. Create a reviewer account with sample agents, a stable password, and no MFA.
4. Exercise create, update, private simulation, list, aggregate workspace summary, and negative safety prompts from `docs/CHATGPT_APP_SUBMISSION.md`.
5. Verify that the workspace summary returns only aggregates and connection state—never customer identifiers, communication bodies, transcripts, recordings, or credentials.
6. Capture evidence of OAuth, draft creation, customization, simulation, workspace visibility, and the unlaunched state.
7. Submit the account-bound version for review only after production checks pass.
