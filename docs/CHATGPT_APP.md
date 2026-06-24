# Wireline ChatGPT App

## Product contract

**Connect Wireline, describe the agent you need in ChatGPT, and create a real private draft in your workspace.**

Wireline is not an anonymous demo surface. A connected user can create, read, refine, list, and privately simulate agents that belong to their Wireline workspace.

```text
ChatGPT conversation
→ Wireline OAuth account connection
→ confirmed agent draft creation
→ private voice simulation
→ full configuration / testing / launch in Wireline
```

## What ChatGPT owns

- Conversational discovery of the user’s business need.
- Turning a natural-language request into a structured customization profile.
- Collecting explicit confirmation before a private draft is created or changed.
- Private voice simulation of a saved draft.

## What Wireline owns

- Tenant isolation and account ownership.
- Entitlement and capacity checks.
- Agent profile normalization and prompt compilation.
- Knowledge sources, phone numbers, integrations, business hours, compliance, billing, and launch.
- Every external action and every lifecycle transition beyond draft/simulation.

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
Knowledge: account-holder summary
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
| `list_wireline_agents` | `agents.read` | Lists the connected user’s agents. |

### Non-goals for this transport

- No phone-number purchase or attachment.
- No inbound or outbound calling.
- No messaging, email, calendar, CRM, or payment mutations.
- No call-recording or raw-customer-data access.
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

Use Client Identifier Metadata Document (CIMD) registration. Do not configure Dynamic Client Registration or OIDC for V1. The exact production registration is recorded in `docs/CHATGPT_APP_DASHBOARD_CONFIG.md`.

## Private rollout and App Directory readiness

1. Test OAuth with a real Wireline account.
2. Create a reviewer account with sample agents, a stable password, and no MFA.
3. Exercise create, update, private simulation, list, and negative safety prompts from `docs/CHATGPT_APP_SUBMISSION.md`.
4. Capture evidence of OAuth, draft creation, customization, simulation, and the unlaunched state.
5. Submit the account-bound version for review only after production checks pass.
