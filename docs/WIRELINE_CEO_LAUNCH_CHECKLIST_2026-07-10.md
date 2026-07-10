# Wireline CEO Launch Checklist

## Positioning

Lead with **Wireline CEO** as the default product promise.

Primary copy:

> One agent that answers, sells, books, follows up, researches, and keeps the business moving.

Secondary copy:

> Start with your Wireline CEO. Add specialist agents only when volume proves you need them.

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

## Success metrics

- First successful test call within 5 minutes.
- % of users creating CEO as first agent.
- % of CEO users enabling at least one live channel.
- First-week handled conversations.
- Second-agent creation rate by role.
- Escalation rate and owner-interruption reduction.
