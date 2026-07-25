# Wireline Best-Employee Launch Checklist

## Positioning

Lead with **the best employee you've ever had, for next to nothing** as the default product promise.

Primary copy:

> The best employee you've ever had, for next to nothing.

Secondary copy:

> One trained AI employee that answers, sells, markets, books, follows up, researches, and keeps the work moving - with your rules, your approvals, and every outcome logged.

Avoid leading with:

- "AI CEO"
- "Wireline CEO"
- "pick a role"
- "configure your bot"
- "AI employee lanes"
- any copy that makes the owner feel replaced, challenged, or forced to design an org chart before getting value

## Who it serves

- Solopreneurs: one best employee instead of a fake department tree.
- Small teams: a right-hand operator that can later split into specialists.
- Personal plans: a privacy-first assistant for calls, reminders, scheduling, vendors, and follow-up.
- Agencies / multi-location businesses: one all-purpose employee first, specialists later by line of business or location.

## Onboarding rule

Do not ask the user to choose from ten roles first.

Ask:

1. What should Wireline handle first?
2. Who should it talk to?
3. What should it never do without approval?
4. Where should it send outcomes?

Then create the broad default operator with explicit owner controls and tighten from permissions.

## Public marketing surfaces to align

- Landing hero: "The best employee you've ever had, for next to nothing."
- CTA: "Build your best employee."
- Visual loop: Brief -> Train -> Launch -> Prove.
- Proof words: Researches, calls, answers, books, follows up, reports.
- Pricing: one included live AI employee and included number, not a menu of departments.
- Template gallery: Best Employee / Wireline Operator first; specialists below it.
- Empty states: "Your right-hand operator is live" rather than "pick a role."
- Static HTML/SEO metadata: best employee / AI phone employee, not CEO-first language.

## Pricing decision

Paid extra agents should add useful capacity, not just another seat consuming the same pool.

Founder catalog decision:

- Starter: $9/mo, 1 live agent, 20 guaranteed live-voice minutes.
- Starter Plus: $24/mo, 2 live agents (personal Concierge + business employee), 55 guaranteed live-voice minutes.
- Pro: $59/mo, up to 5 live agents, 120 guaranteed live-voice minutes.
- Business: $149/mo, up to 15 live agents, 285 guaranteed live-voice minutes.
- Extra live agent add-on: $15/mo, plus 1 additional live agent, 1 production-number slot, and 50 additional guaranteed live-voice minutes.

These deliberately low founder prices remain well below the cost of hiring. Upper-tier included
capacity is capped so every monthly plan and every upper-tier annual plan retains at least a 45%
contribution-margin reserve at full included utilization. Additional usage remains prepaid; Wireline
does not create surprise postpaid overages.

Stripe object configured:

```bash
STRIPE_EXTRA_AGENT_PRICE_ID=price_1Tv9K58e6If87QKm7rzn3MNS
```

Runtime rule:

- Stripe subscription sync reads extra-agent item quantity and mirrors it to `wireline_settings.extra_agents`.
- Agent creation cap = plan included agents + paid extra-agent quantity.
- Monthly included voice minutes = plan included minutes + 50 minutes per paid extra agent.
- Add-on prices must never overwrite `wireline_subscriptions.plan`; base plan comes only from base plan price metadata / lookup keys / configured base plan price ids.

This keeps the upsell honest: if the customer pays for another agent, they also get more minutes to use that agent.

## Launch env checklist

**Status: historical / superseded.** The price IDs and env var names below are a snapshot from the 2026-07-10 launch prep. The env var *names* here do not reliably map 1:1 to today's plan *display names* — for example, in the live Founder Early Access catalog `STRIPE_TEAM_PRICE_ID` backs the **Pro** plan and `STRIPE_BUSINESS_PRICE_ID` backs the **Business** plan, not a plan literally called "Team" or "Business." `src/lib/plan-catalog.ts` (the `STRIPE_PLANS` array's `priceIdEnv` / `annualPriceIdEnv` fields) and `.env.example` are the current live source of truth for which env var backs which plan tier — verify against those before treating anything below as current.

Before production launch, verify these are present in Vercel for Production and Preview:

```bash
STRIPE_STARTER_9_PRICE_ID=price_1Tv9K08e6If87QKmt8n8bkiX
STRIPE_STARTER_9_ANNUAL_PRICE_ID=price_1TvlQa8e6If87QKmm9GTajo6
STRIPE_STARTER_PRICE_ID=price_1Tv9K18e6If87QKmJno3YyTp
STRIPE_STARTER_ANNUAL_PRICE_ID=price_1Tv9K18e6If87QKmOLPol6N3
STRIPE_TEAM_PRICE_ID=price_1Tv9K28e6If87QKmoe22FUz1
STRIPE_TEAM_ANNUAL_PRICE_ID=price_1Tv9K38e6If87QKm3OsZgYcy
STRIPE_BUSINESS_PRICE_ID=price_1Tv9K38e6If87QKmkWgepqBn
STRIPE_BUSINESS_ANNUAL_PRICE_ID=price_1Tv9K48e6If87QKm4pwXGJGl
STRIPE_EXTRA_AGENT_PRICE_ID=price_1Tv9K58e6If87QKm7rzn3MNS
STRIPE_LIVE_VIDEO_ADDON_PRICE_ID=price_1Tv9K58e6If87QKmYM6sqWkL
PERPLEXITY_API_KEY=...
PERPLEXITY_MODEL=sonar
LIVE_RESEARCH_TIMEOUT_MS=8000
GEMINI_API_KEY=...
```

`LIVE_RESEARCH_TIMEOUT_MS` is only the mid-call web-research HTTP timeout (default 8s). It is **not** a PSTN call-duration or billing limit — live calls run as long as needed and bill from included minutes then prepaid Conversation Balance.

Do not paste populated secrets into GitHub or docs. Only Vercel project env should contain real secret values.

## Permission model

The default operator gets the broad operating toolbox by default, but execution is still constrained by:

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

Again: `LIVE_RESEARCH_TIMEOUT_MS` bounds research latency only, not how long a phone call may last.

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

The default should always feel like: "start with one best employee, split later if needed."

## QA gates before merge

- Typecheck role definitions and agent constants.
- Validate creating an agent without `role` persists `ceo` internally for compatibility.
- Validate `/api/agents/roles` and `/api/mobile/agents/roles` show `Wireline Operator` for the broad default role.
- Validate the broad default agent with no explicit `enabledTools` gets the full tool catalog, then filters by connected integrations.
- Validate `gemini_ground` still works as the compatible Vapi tool name when only `PERPLEXITY_API_KEY` is set.
- Validate fallback to Gemini when Perplexity is missing, times out, or returns a non-2xx response.
- Validate personal-plan copy does not accidentally use CRM / pipeline language.
- Validate extra-agent subscription quantity raises both deployable agent cap and included voice minutes.
- Validate the extra-agent price never overwrites the base subscription plan during Stripe webhook sync.
- Validate `/pricing`, `/api/billing/plans`, and the app shell metadata all show best-employee/capacity-bundle language.

## Success metrics

- First successful test call within 5 minutes.
- % of users creating the default broad operator first.
- % of broad-operator users enabling at least one live channel.
- First-week handled conversations.
- Second-agent creation rate by role.
- Escalation rate and owner-interruption reduction.
