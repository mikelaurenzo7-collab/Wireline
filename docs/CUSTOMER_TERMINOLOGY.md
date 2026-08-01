# Customer Terminology

Status: **Active canonical language policy**.

## Decision

Wireline keeps both account types because they change defaults, collaboration,
and customer intent:

- **Personal workspace** — the customer creates a **personal agent** for their
  own calls, appointments, follow-up, and personal tasks.
- **Business workspace** — the customer creates a **business voice agent** for a
  customer-facing job shared with a team.

The signup question is “How will you use Wireline?”, not a claim that every
user is employing someone. Personal and Business are useful defaults, not
permanent silos; the creation flow can still switch posture deliberately.

## Surface rules

| Surface                                       | Canonical language                                       |
| --------------------------------------------- | -------------------------------------------------------- |
| Personal signup/setup                         | `personal agent`, `agent`                                |
| Business signup/setup                         | `business voice agent`, `voice agent`                    |
| Broad business marketing                      | `Voice agent`, `business voice agent`                 |
| Personal marketing                            | `personal agent` or plain-language task copy             |
| Navigation                                    | `Agent` in Personal; `Voice Agent` in Business           |
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

- “Build your first business voice agent.”
- “What job should this voice agent own?”
- “Start with one customer-facing job.”
- CTA: “Create business voice agent”

## Avoid

- **“AI” next to “agent.”** They name the same thing, so “AI voice agent” says
  it twice and “AI” is the word doing the least work. The noun is `voice agent`.
  This is a copy rule, not a code rule: keyword metadata still carries the terms
  people type into a search box, and technical identifiers are untouched.
- Bare “employee” before the customer chooses Personal or Business.
- Bare “business agent” without the voice-agent context in customer-facing creation copy.
- “AI Voice Employee” as a separate product category; voice is one channel.
- Renaming technical `agent` fields or tool names.
- Treating Personal and Business as pricing tiers; they are workspace/use-case
  postures while plan IDs remain the billing source of truth.
