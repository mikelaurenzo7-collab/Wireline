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

## Pricing capacity rule

Extra paid agents are not seat-only upsells.

The launch add-on is:

- $15/month
- 1 additional live agent
- 1 additional production-number slot
- 50 additional guaranteed live-voice minutes each month

Runtime must treat that as real capacity: Stripe subscription sync mirrors extra-agent quantity into local settings, agent creation uses the increased cap, and voice usage counts the additional included minutes before charging Conversation Balance.

## Implemented in this branch

- Canonical `ceo` role added to the role API.
- Web/mobile create default changed to `ceo`.
- Runtime fallback role changed to `ceo`.
- CEO personality template added.
- CEO capability defaults set to the full operating toolbox.
- Fresh public research service added with Perplexity-first and Gemini fallback behavior.
- Agent grounding handler now uses the fresh-public-research service.
- Static SEO/social metadata now leads with Wireline CEO/front-office positioning.
- Stripe extra-agent add-on created and documented.
- Extra-agent quantity syncs from Stripe to local agent and voice-minute capacity.

## Metrics goal

70% of new signups complete one successful test call within 5 minutes and understand that they can start with one agent before adding specialists.

## Next

1. Verify Vercel production envs exactly match the launch checklist.
2. Run one founder signup → free build → paid checkout → first live test call flow.
3. Validate extra-agent quantity in Stripe increases `extra_agents`, deployable agent cap, and included voice minutes.
4. Track role adoption: CEO vs specialist first agent, first-call completion, and second-agent creation rate.
