# Customer Terminology

Status: **Active canonical language policy**.

## Decision

BotBound is one product and one workspace model. Customers describe the work,
choose a role starter, and configure a **Bot**. `BotBound Personal` is a paid plan
name, while the workspace and Bot use the same product and policy model.

The `personal` plan ID now identifies the paid BotBound Personal plan. Historical
Free Builder text and `free`/`builder` signup aliases do not make it free.
Legacy `personal` and `business` account, agent, and provider values remain
compatibility identifiers until they can be migrated safely; they do not create
separate workspace models.

## Surface rules

| Surface | Canonical language |
| --- | --- |
| Broad marketing | `Bot`, `Phone Bot`, or a concrete role such as `Front Desk`; launch capabilities are calling, email, and Computer. SMS, campaign calling, and unproven messaging integrations stay outside launch promotion. |
| Signup and setup | `Create` a Bot, `Set Up` its playbook, `Rehearse` privately, then activate live work when ready. Never `Wire` as a customer step. |
| Workspace and navigation | `Bot`, `Bots`, `workspace`, `Knowledge` |
| Role starters | Job names such as `Sales Rep`, `Support`, or `Personal Assistant` |
| Pricing | Paid `BotBound Personal`; `Calls`, `Email`, or `Calls + Email`, with `Starter`, `Plus`, and `Pro` capacity choices. Use `Custom Setup` for a founder reviewed request. Use the current catalog and account entitlements for price and availability claims. |
| Technical APIs, routes, DB, events, MCP tools | Keep stable `agent`, plan, and account identifiers |

The shared customer-facing noun resolves through `CUSTOMER_AGENT_LANGUAGE` in
`src/lib/product-copy.ts`. Both legacy postures deliberately return the same Bot
language.

## Required prompts

- “Create a Bot.”
- “Set up its playbook.”
- “Rehearse privately.”
- “What job should your Bot own?”
- “Start with a proven role or create your own.”
- “Add knowledge and rules.”
- CTA: “Create a Bot”

## Avoid

- Separate Personal and Business workspace or Bot policy models. The paid
  `BotBound Personal` plan name remains valid.
- Calling Personal or live work free because a compatibility URL says `free`.
  Keep display names separate from billing identity and continue accepting
  historical aliases; use the canonical plan ID for new plan links.
- `Wire` as a customer-facing setup step, nav label, or CTA. Technical events may retain `wire_*`.
- `AI employee` as the product description.
- `AI` next to `agent` in customer copy.
- Bare `business agent` or `personal agent` when the intended meaning is simply Bot.
- Renaming structural API, database, event, provider, or billing contracts only
  for copy consistency.

`Business name`, `business hours`, and `Personal Assistant` remain valid when
they name real customer data or a real job. The rule removes product taxonomy,
not ordinary language.
