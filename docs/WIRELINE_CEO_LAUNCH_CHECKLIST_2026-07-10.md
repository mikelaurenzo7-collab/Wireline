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

## Success metrics

- First successful test call within 5 minutes.
- % of users creating CEO as first agent.
- % of CEO users enabling at least one live channel.
- First-week handled conversations.
- Second-agent creation rate by role.
- Escalation rate and owner-interruption reduction.
