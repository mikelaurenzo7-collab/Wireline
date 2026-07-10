# Wireline One-Agent Strategy

## Executive decision

Wireline should lead with one all-encompassing default: **Wireline CEO**.

The buyer promise is not “configure five agents.” It is: connect your number, teach Wireline the business, and let one operating agent handle the first pass across sales, marketing, front desk, support, scheduling, light finance, follow-up, and personal admin.

Role-specific agents still matter, but they should be framed as optional specialist presets after the user understands the core outcome.

## Product shape

1. Default create role: `ceo`.
2. Default capability posture: broad toolbox, narrowed by integration availability and explicit owner permissions.
3. Specialist presets: Sales, Support, Scheduler, Receptionist, Marketing, Collections, Technical Support, E-commerce, and Personal Assistant.
4. Personal plan posture: “protect my time and handle my calls,” not “run my CRM.” The same CEO agent can gracefully behave like a personal chief of staff when the account is personal.

## Why this is stronger

- Lower setup friction: one obvious starting point.
- Better launch positioning: “your AI operating agent” is easier to buy than a menu of bots.
- Works for solopreneurs: they do not have departments, but they still have sales, admin, support, and follow-up.
- Works for teams: specialists can be added later once volume proves where the business needs separation.
- Works for personal plans: the same operating model becomes a privacy-first personal assistant.

## Commercial model

The pricing story should reinforce the product story:

- Start with one Wireline CEO.
- Let customers add specialists when they know where volume is real.
- When they pay for another live agent, they should also get more voice capacity.

Founder decision: the extra-agent add-on is a capacity bundle, not a seat-only tax.

```bash
STRIPE_EXTRA_AGENT_PRICE_ID=price_1TrnEvJohDtfy3IkjBi7VOCP
```

That Stripe price is $15/month and includes:

- 1 additional live agent
- 1 additional production-number slot
- 50 additional guaranteed live-voice minutes each month

This keeps the upsell honest and launch-friendly: customers feel more operating capacity immediately.

## Live public intelligence

Agents now have a provider-agnostic fresh-public-research path:

- `PERPLEXITY_API_KEY` enables Perplexity-first live research.
- `GEMINI_API_KEY` remains the fallback grounded-search provider.
- The existing `gemini_ground` tool name is preserved for compatibility, but the runtime now chooses the best configured provider.

Use cases:

- current business hours and local facts
- lead-gen prep before or during calls
- competitor pricing and market context
- regulatory or policy updates
- “what changed recently?” caller questions

## Implemented in this branch

- Canonical `ceo` role added to the role API.
- Web/mobile create default changed to `ceo`.
- Runtime fallback role changed to `ceo`.
- CEO personality template added.
- CEO capability defaults set to the full operating toolbox.
- Fresh public research service added with Perplexity-first and Gemini fallback behavior.
- Agent grounding handler now uses the fresh-public-research service.
- Extra-agent pricing now includes +50 guaranteed voice minutes and one number slot per paid added agent.

## Metrics goal

70% of new signups complete one successful test call within 5 minutes and understand that they can start with one agent before adding specialists.

## Next

1. Update launch copy to lead with “Wireline CEO.”
2. Make onboarding ask for the business outcome first, then permissions.
3. Add a first-run “what should I handle?” checklist that configures CEO scope without making the user choose departments.
4. Track role adoption: CEO vs specialist first agent, first-call completion, second-agent creation rate, and paid extra-agent attach rate.
