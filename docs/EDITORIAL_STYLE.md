# Wireline editorial style

Wireline should feel direct, premium, and operational. Copy should help users move through Create, Train, and Run without inflated claims or visual noise.

## Voice

- Short sentences.
- Plain language.
- Confident verbs.
- Truthful states.
- No filler helper text when the UI already explains the action.

## Casing matrix

| Element | Casing | Example |
| --- | --- | --- |
| Primary headlines | Sentence case | `Create. Train. Run the line.` |
| Buttons | Sentence case | `Use template` |
| Form labels | Sentence case | `Email address` |
| Helper text | Sentence case | `Use at least 12 characters.` |
| Status text | Sentence case | `Training` |
| Navigation | Sentence case except proper nouns | `Call logs` |
| Technical eyebrows | All caps only when compact metadata is intentional | `BETA` |
| Provider names | Preserve brand casing | `Google Calendar`, `CRM Notes` |

## Canonical product language

Use this model everywhere:

- **Create**: build the agent and define its job.
- **Train**: attach knowledge, policies, voice, flows, and evaluation.
- **Run**: operate the line, review outcomes, approve handoffs, and improve.

Preferred phrases:

- `Create. Train. Run the line.`
- `Run the line`
- `Use template`
- `See examples`
- `Training`
- `Voice set`
- `Not set`

Avoid:

- Long dashboard descriptions.
- Decorative stats without real backing data.
- Empty-state paragraphs that repeat the heading.
- Mixing `Command`, `Assistant`, `Agent`, and `Wire Agent` for the same job.
- Fake customer/account examples on production surfaces.

## Empty states

Every empty state should answer three questions:

1. What is missing?
2. Why does it matter?
3. What is the next action?

Good:

> No calls yet. Connect a number to start running the line.

Bad:

> Your recent activity will appear here when you start using Wireline.

## Action labels

Use verbs that match the outcome.

| Intent | Preferred label |
| --- | --- |
| Start from a template | `Use template` |
| Open public examples | `See examples` |
| Add a source | `Add source` |
| Connect an integration | `Connect` |
| Save configuration | `Save changes` |
| Leave account | `Sign out` |
| Busy sign-out state | `Signing out…` |

## Number and readiness language

Only show exact numbers when they are backed by real data. Otherwise, show a literal state.

Preferred:

- `Training`
- `Active line`
- `Voice set`
- `Not set`

Avoid invented readiness percentages, placeholder balances, and seeded contact details.

## Design density

Desktop and laptop screens should feel intentionally dense, not cramped. Mobile screens should prioritize the next action over broad explanatory copy.

- One page title.
- One primary CTA per section.
- Short card headings.
- Helper copy only where it changes behavior.
- Do not spend prime viewport space on empty decoration.
