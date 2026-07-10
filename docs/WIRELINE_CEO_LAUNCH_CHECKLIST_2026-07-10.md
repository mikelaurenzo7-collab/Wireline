# Wireline CEO Launch Checklist

## Positioning

Lead with **Wireline CEO** as the default product promise.

Primary copy:

> One agent that answers, sells, books, follows up, researches, and keeps the business moving.

Secondary copy:

> Start with your Wireline CEO. Add specialist agents only when volume proves you need them.

Avoid leading with:

- "pick a role"
- "configure your bot"
- "AI employee lanes"
- any copy that makes the customer feel like they need to design an org chart before getting value

## Who it serves

- Solopreneurs: one operating agent instead of a fake department tree.
- Small teams: a front-office operator that can later split into specialists.
- Personal plans: a privacy-first chief of staff for calls, reminders, scheduling, vendors, and follow-up.
- Agencies / multi-location businesses: CEO first, specialists later by line of business or location.

## Onboarding rule

Do not ask the user to choose from ten roles first.

Ask:

1. What should Wireline handle first?
2. Who should it talk to?
3. What should it never do without approval?
4. Where should it send outcomes?

Then create the CEO agent with broad capabilities and tighten from permissions.

## Public marketing surfaces to align

- Landing hero: "One agent to run the front office."
- CTA: "Build your Wireline CEO."
- Visual loop: Brief → Train → Launch → Operate.
- Proof words: Researches, calls, answers, books, follows up, reports.
- Pricing: one included operating agent and included number, not a menu of departments.
- Template gallery: CEO / Operating Agent first; specialists below it.
- Empty states: "Your front office is covered" rather than "pick a role."
- Static HTML/SEO metadata: Wireline CEO / one front-office operating agent, not the old "AI employee" headline.

## Pricing decision

Paid extra agents should add useful capacity, not just another seat consuming the same pool.

Founder catalog decision:

- Starter: $9/mo, 1 live agent, 20 guaranteed live-voice minutes.
- Starter Plus: $19/mo, 1 live agent, 75 guaranteed live-voice minutes.
- Pro: $59/mo, up to 5 live agents, 250 guaranteed live-voice minutes.
- Business: $149/mo, up to 15 live agents, 650 guaranteed live-voice minutes.
- Extra live agent add-on: $15/mo, plus 1 additional live agent, 1 production-number slot, and 50 additional guaranteed live-voice minutes.

Stripe object configured:

```bash
STRIPE_EXTRA_AGENT_PRICE_ID=price_1TrnEvJohDtfy3IkjBi7VOCP
```

Runtime rule:

- Stripe subscription sync reads extra-agent item quantity and mirrors it to `wireline_settings.extra_agents`.
- Agent creation cap = plan included agents + paid extra-agent quantity.
- Monthly included voice minutes = plan included minutes + 50 minutes per paid extra agent.
- Add-on prices must never overwrite `wireline_subscriptions.plan`; base plan comes only from base plan price metadata / lookup keys / configured base plan price ids.

This keeps the upsell honest: if the customer pays for another agent, they also get more minutes to use that agent.

## Launch env checklist

Before production launch, verify these are present in Vercel for Production and Preview:

```bash
STRIPE_STARTER_9_PRICE_ID=price_1TraB4JohDtfy3IkKFF3zI5C
STRIPE_STARTER_9_ANNUAL_PRICE_ID=price_1TraBAJohDtfy3IkgLxLqDVI
STRIPE_STARTER_PRICE_ID=price_1TrZ9AJohDtfy3Ika0bPG5Dc
STRIPE_STARTER_ANNUAL_PRICE_ID=price_1TrZ9GJohDtfy3IkUxOJscJZ
STRIPE_TEAM_PRICE_ID=price_1TrZ9RJohDtfy3Ik9Q4QFABQ
STRIPE_TEAM_ANNUAL_PRICE_ID=price_1TrZ9XJohDtfy3Ikp1RQzxrj
STRIPE_BUSINESS_PRICE_ID=price_1TrZ9gJohDtfy3Ik7zHhg92a
STRIPE_BUSINESS_ANNUAL_PRICE_ID=price_1TrZ9pJohDtfy3Ik0zUieFvi
STRIPE_EXTRA_AGENT_PRICE_ID=price_1TrnEvJohDtfy3IkjBi7VOCP
PERPLEXITY_API_KEY=...
PERPLEXITY_MODEL=sonar
LIVE_RESEARCH_TIMEOUT_MS=8000
GEMINI_API_KEY=...
```

Do not paste populated secrets into GitHub or docs. Only Vercel project env should contain real secret values.

## Permission model

CEO gets the broad operating toolbox by default, but execution is still constrained by:

- tenant OAuth connections
- platform env flags
- explicit enabled-tools overrides
- escalation rules
- business hours and compliance settings
- account plan capacity and usage limits

## Live research rollout

Configure `PERPLEXITY_API_KEY` in Vercel to enable Perplexity-first live public research. Keep `GEMINI_API_KEY` configured as fallback.

Recommended env:

```bash
PERPLEXITY_API_KEY=...
PERPLEXITY_MODEL=sonar
LIVE_RESEARCH_TIMEOUT_MS=8000
GEMINI_API_KEY=...
```

Use live research for:

- current public facts
- lead-gen prep
- competitor/context questions
- business hours and local lookups
- recent market or regulatory updates

Do not use live research for internal customer data. Use CRM, call history, email, commerce, and knowledge-base tools for that.

## Specialist strategy

Keep specialist roles, but position them as second-step scaling:

- Sales: higher-volume outbound or late-stage sales.
- Support: high-volume post-sale service.
- Scheduler: appointment-heavy businesses.
- Receptionist: front-desk-heavy businesses.
- Marketing: campaigns and re-engagement.
- Personal Assistant: personal-only posture.

The default should always feel like: "start with CEO, split later if needed."

## QA gates before merge

- Typecheck role definitions and agent constants.
- Validate creating an agent without `role` persists `ceo`.
- Validate `/api/agents/roles` and `/api/mobile/agents/roles` include `Wireline CEO` first.
- Validate CEO agent with no explicit `enabledTools` gets the full tool catalog, then filters by connected integrations.
- Validate `gemini_ground` still works as the compatible Vapi tool name when only `PERPLEXITY_API_KEY` is set.
- Validate fallback to Gemini when Perplexity is missing, times out, or returns a non-2xx response.
- Validate personal-plan copy does not accidentally use CRM / pipeline language.
- Validate extra-agent subscription quantity raises both deployable agent cap and included voice minutes.
- Validate the extra-agent price never overwrites the base subscription plan during Stripe webhook sync.
- Validate `/pricing`, `/api/billing/plans`, and the app shell metadata all show CEO-first/capacity-bundle language.

## Success metrics

- First successful test call within 5 minutes.
- % of users creating CEO as first agent.
- % of CEO users enabling at least one live channel.
- First-week handled conversations.
- Second-agent creation rate by role.
- Escalation rate and owner-interruption reduction.
