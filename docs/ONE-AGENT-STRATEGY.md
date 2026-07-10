# Wireline One-Employee Strategy

## Executive decision

Wireline should lead with one all-encompassing default: **the best employee you've ever had, for next to nothing**.

The buyer promise is not “configure five agents” or “replace yourself with an AI CEO.” It is: connect your number, teach Wireline the business, and let one trained AI employee handle the first pass across sales, marketing, front desk, support, scheduling, light finance, follow-up, recovery, and personal admin under your rules.

Role-specific agents still matter, but they should be framed as optional specialist presets after the user understands the core outcome.

## Product shape

1. Default create role: `ceo` internally for compatibility, labeled externally as **Wireline Operator** / **Best Employee**.
2. Default capability posture: broad toolbox, narrowed by integration availability and explicit owner permissions.
3. Specialist presets: Sales, Support, Scheduler, Receptionist, Marketing, Collections, Technical Support, E-commerce, and Personal Assistant.
4. Personal plan posture: “protect my time and handle my calls,” not “run my CRM.” The same default operator gracefully behaves like a privacy-first personal assistant when the account is personal.

## Why this is stronger

- Lower setup friction: one obvious starting point.
- Better launch positioning: “your best employee” is easier to buy than “AI CEO,” especially for SMB owners who want control.
- Better team acceptance: right-hand operators and managers are less threatened by an employee that takes busywork than by a product labeled CEO.
- Works for solopreneurs: they do not have departments, but they still have sales, admin, support, marketing, and follow-up.
- Works for teams: specialists can be added later once volume proves where the business needs separation.
- Works for personal plans: the same operating model becomes a privacy-first personal assistant.

## Live public intelligence

Agents have a provider-agnostic fresh-public-research path:

- `PERPLEXITY_API_KEY` enables Perplexity-first live research.
- `GEMINI_API_KEY` remains the fallback grounded-search provider.
- The existing `gemini_ground` tool name is preserved for compatibility, but the runtime chooses the best configured provider.

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

## Implemented posture

- Canonical `ceo` role remains in the role API for compatibility.
- Customer-facing role label changes to `Wireline Operator`.
- Web/mobile create default remains the broad all-purpose operator.
- Runtime fallback remains broad by default.
- Default personality template says best employee / right-hand operator, not CEO.
- Public SEO/social metadata leads with best-employee positioning.
- Stripe extra-agent add-on remains documented.
- Extra-agent quantity syncs from Stripe to local agent and voice-minute capacity.

## Metrics goal

70% of new signups complete one successful test call within 5 minutes and understand that they can start with one AI employee before adding specialists.

## Next

1. Verify Vercel production envs exactly match the launch checklist.
2. Run one founder signup → free build → paid checkout → first live test call flow.
3. Validate extra-agent quantity in Stripe increases `extra_agents`, deployable agent cap, and included voice minutes.
4. Track first-call completion, first-use lane, second-agent creation, and whether users describe the product back as “employee,” “operator,” or “agent.”
