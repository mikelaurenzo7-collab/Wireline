# Customer Terminology

Status: **Active canonical language policy**.

## Decision

Wireline keeps both account types because they change defaults, collaboration,
and customer intent:

- **Personal workspace** — the customer creates a **personal agent** for their
  own calls, appointments, follow-up, and personal tasks.
- **Business workspace** — the customer creates an **AI employee** for a
  customer-facing job shared with a team.

The signup question is “How will you use Wireline?”, not a claim that every
user is employing someone. Personal and Business are useful defaults, not
permanent silos; the creation flow can still switch posture deliberately.

## Surface rules

| Surface                                       | Canonical language                                       |
| --------------------------------------------- | -------------------------------------------------------- |
| Personal signup/setup                         | `personal agent`, `agent`                                |
| Business signup/setup                         | `AI employee`, `employee`                                |
| Broad business marketing                      | `AI employee`                                            |
| Personal marketing                            | `personal agent` or plain-language task copy             |
| Navigation                                    | `Agent` in Personal; `AI Employee` in Business           |
| Technical APIs, routes, DB, events, MCP tools | `agent`                                                  |
| Internal identifiers                          | Keep `agentId`, `agents`, `/api/agents`, `agent_created` |

Do not rename structural API or database contracts for marketing consistency.
The customer-facing noun is resolved by `CUSTOMER_AGENT_LANGUAGE` in
`src/lib/product-copy.ts`.

## Required prompts

### Personal

- “Build your first personal agent.”
- “What should your personal agent handle?”
- “Start with one call, appointment, or personal task.”
- CTA: “Create personal agent”

### Business

- “Build your first AI employee.”
- “What job should this AI employee own?”
- “Start with one customer-facing job.”
- CTA: “Create AI employee”

## Avoid

- Bare “employee” before the customer chooses Personal or Business.
- “Business agent” in customer-facing creation copy.
- “AI Voice Employee” as a separate product category; voice is one channel.
- Renaming technical `agent` fields or tool names.
- Treating Personal and Business as pricing tiers; they are workspace/use-case
  postures while plan IDs remain the billing source of truth.
