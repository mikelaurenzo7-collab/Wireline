# Customer Terminology

Status: **Active canonical language policy**.

## Decision

BotBound is one product and one workspace model. Customers describe the work,
choose a role starter, and configure a **Bot**. They do not classify the product,
workspace, or Bot as Personal or Business.

Legacy `personal` and `business` values remain in billing, account, agent, and
provider contracts until they can be migrated safely. They are compatibility
identifiers, not customer language and not separate product lanes.

## Surface rules

| Surface | Canonical language |
| --- | --- |
| Broad marketing | `Bot`, `Phone Bot`, or a concrete role such as `Front Desk` |
| Signup and setup | `Build your Bot`, then `Train`, `Test`, `Launch`. Never `Wire` as a customer step. |
| Workspace and navigation | `Bot`, `Bots`, `workspace`, `Knowledge` |
| Role starters | Job names such as `Sales Rep`, `Support`, or `Personal Assistant` |
| Pricing | `Free Builder`, `Starter`, `Starter Plus`, `Pro`, `Scale` |
| Technical APIs, routes, DB, events, MCP tools | Keep stable `agent`, plan, and account identifiers |

The shared customer-facing noun resolves through `CUSTOMER_AGENT_LANGUAGE` in
`src/lib/product-copy.ts`. Both legacy postures deliberately return the same Bot
language.

## Required prompts

- “Build your Bot.”
- “What job should your Bot own?”
- “Start with a proven role or create your own.”
- “Add knowledge and rules.”
- CTA: “Create Bot” or “Build Your Bot”

## Avoid

- Personal or Business as a workspace, signup choice, pricing lane, or product noun.
- Audience-shaped public plan URLs. Emit `free`, `starter`, `starter-plus`, and
  `pro`; continue accepting historical aliases.
- `Wire` as a customer-facing setup step, nav label, or CTA. Technical events may retain `wire_*`.
- `AI employee` as the product description.
- `AI` next to `agent` in customer copy.
- Bare `business agent` or `personal agent` when the intended meaning is simply Bot.
- Renaming structural API, database, event, provider, or billing contracts only
  for copy consistency.

`Business name`, `business hours`, and `Personal Assistant` remain valid when
they name real customer data or a real job. The rule removes product taxonomy,
not ordinary language.
