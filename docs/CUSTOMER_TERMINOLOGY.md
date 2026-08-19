# Customer Terminology

Status: **Active canonical language policy**.

## Decision

Wireline is one workspace of **voice agents**. The customer configures each
agent by role: Lead Agent, Sales, Receptionist, Support, Scheduler,
Collections, Concierge, Custom, or a specialist they add later.

Do not split the product into a personal workspace and a business workspace.
Role, training, and tools describe how the agent is used. Plan IDs remain the
billing source of truth.

## Surface rules

| Surface                                       | Canonical language                                       |
| --------------------------------------------- | -------------------------------------------------------- |
| Signup, setup, Studio, Overview               | `voice agent`                                            |
| Public marketing                              | `Voice Agent`                                            |
| Role-specific context                         | `sales agent`, `support agent`, `Lead Agent`, `Concierge` |
| Navigation                                    | `Voice Agent`                                            |
| Technical APIs, routes, DB, events, MCP tools | `agent`                                                  |
| Internal identifiers                          | Keep `agentId`, `agents`, `/api/agents`, `agent_created` |

Do not rename structural API or database contracts for marketing consistency.
The customer-facing noun is resolved by `CUSTOMER_AGENT_LANGUAGE` in
`src/lib/product-copy.ts`. Stored `is_business_agent` and `accounts.type`
values are compatibility fields, not customer-facing product names.

## Required prompts

- “Build your first voice agent.”
- “What should this voice agent handle?”
- “Start with one job. Change the role anytime.”
- CTA: “Create Voice Agent”

## Avoid

- **“AI” next to “agent.”** They name the same thing, so “AI voice agent” says
  it twice and “AI” is the word doing the least work. The noun is `voice agent`.
  This is a copy rule, not a code rule: keyword metadata still carries the terms
  people type into a search box, and technical identifiers are untouched.
- Bare “employee” as a product category. Role chips may name jobs (Sales,
  Receptionist, Concierge) without calling the product an employee.
- Bare “business agent” or “personal agent” as workspace brands.
- “AI Voice Employee” as a separate product category; voice is one channel.
- Renaming technical `agent` fields or tool names.
- Treating Personal and Business as workspaces; plan IDs such as `personal`
  (Free Builder) remain billing identifiers only.
