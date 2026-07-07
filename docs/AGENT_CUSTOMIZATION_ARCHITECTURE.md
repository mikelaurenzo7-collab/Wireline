# Wireline Customizable Agent Architecture

## Principle

Wireline agents are deeply customizable. The rule is not that customers cannot customize them; the rule is that customers must not independently define what customization means at runtime.

Every client - Web, ChatGPT MCP, iOS, and Android - edits the same canonical agent profile. The Wireline domain layer validates it, checks entitlement and tenant ownership, compiles runtime instructions, and determines the lifecycle transition.

## Agent profile

The canonical profile is defined in `src/lib/agent-customization.ts`.

```text
Identity
- name
- business / brand
- role
- tone

Mission
- primary goal
- success criteria

Behavior
- operating rules
- prohibited topics
- intended actions
- escalation policy

Training
- account-holder supplied brief
- approved facts, documents, and policies

Lifecycle
- draft -> configured -> simulated -> test-ready -> launch-ready -> live -> paused -> archived
```

The current persistence schema already supports the profile through `wireline_agents` fields plus `flow_config`, `business_variables`, `system_prompt_override`, `disallowed_topics`, `enabled_tools`, business-hours, voice, escalation, and integration fields.

## The customization boundary

A user can say:

> "Ava is a calm front-desk and sales support agent. She can qualify new callers, answer approved FAQs, capture urgency and preferred follow-up time, never quote prices, escalate urgent requests when a handoff is configured, and only speak after business hours."

All clients may collect and edit that request. Only the domain compiler turns it into runtime instructions. This prevents the following failure mode:

```text
ChatGPT says the agent can book an appointment
Web says the same agent only takes messages
iOS says it can transfer the call
Android has a different escalation rule
```

Instead:

```text
Every client -> canonical profile -> policy/entitlement checks -> compiled runtime -> same agent behavior
```

## Intended actions are not permissions

`allowedActions` expresses the account holder's intended behavior. It does not automatically enable an external tool.

Example:

```text
Allowed action: offer an estimate callback
```

The runtime can only complete that action when all of these are true:

1. The user has configured the relevant Wireline connection.
2. The agent's policy permits it.
3. The tenant entitlement permits it.
4. The request passes applicable business-hour, compliance, consent, and escalation rules.
5. The connected provider confirms success.

The compiled instructions explicitly prohibit claiming completion without a successful configured tool result.

## Client responsibilities

| Client | What it edits | What it must not own |
| --- | --- | --- |
| Web | Full agent builder, Training, integrations, business hours, and launch controls | Independent prompt compilation or lifecycle enforcement |
| ChatGPT MCP | Conversational drafting and refinement, private simulation | Guest-owned state, external action enablement, launch authority |
| iOS | Quick edits, status, simulations, handoff, native control surfaces | Separate business rules or prompt logic |
| Android | Quick edits, status, simulations, handoff, notifications | Separate business rules or prompt logic |

## Domain services

- `normalizeAgentCustomization`: bounds and normalizes user-provided configuration.
- `compileAgentRuntimeInstructions`: produces the canonical runtime instructions.
- `createAgentDraft`: checks tenant entitlement and writes an unlaunched draft.
- `getAgentDraft`: returns the tenant-scoped canonical draft.
- `updateAgentDraft`: applies a confirmed private update through the same compiler.

## MCP account requirement

The ChatGPT app requires OAuth before it can create, read, update, list, or simulate an agent. This produces durable workspace-owned drafts and removes anonymous agent state.

The free-account experience may allow private draft creation and limited simulations. Phone numbers, real calls, messaging, external integrations, billing activation, and launch remain separate Wireline actions.
