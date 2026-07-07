# Wireline Launch Operating System

## 1. Category and promise

Wireline is **AI call coverage**.

It gives people an agent that handles time-consuming calls and gives businesses an AI front office that answers, qualifies, routes, follows up, and records what happened.

The category is not "an AI chatbot," "a model picker," or "a telephony API." The customer outcome is simple:

> Every important conversation is handled, tracked, and moved to a useful next step.

## 2. Product segmentation

### Personal

**Customer:** a busy individual who loses time to routine calls, hold queues, scheduling, and follow-up.

**Promise:** "Wireline makes the call, waits on hold, and texts you the answer."

**Activation event:** the customer creates one agent, gives it an operating brief, and completes or reviews its first real call.

**Core surface:** one agent, one number, a concise call feed, and obvious follow-up.

### Business

**Customer:** any owner, operator, sales leader, support leader, agency, practice, restaurant, call center, or team that needs a phone agent to handle live conversations without losing context.

**Promise:** "Every inbound conversation gets a professional next step."

**Launch posture:** sell the broad phone-agent platform first. Vertical pages and templates sharpen proof for specific buyers, but the product must never imply Wireline only accepts one industry or business type.

**Activation event:** the team connects its calendar or inbox, configures routing and escalation, then handles a real inbound call with a recorded outcome.

**Core surface:** agent roster, routing, Training, inbox/outcomes, quality review, and controls.

## 3. Product loop

Every screen must reinforce this sequence:

1. **Create** - create an agent from a role or a custom operating brief.
2. **Train** - turn natural-language instructions into rules, facts, tone, and handoff behavior.
3. **Run** - take or place calls, send messages, schedule, route exceptions, and review outcomes.

A feature that does not strengthen one of these moments is not launch-critical.

## 4. Onboarding standard

### First session

The first session must answer five questions in under five minutes:

- What is Wireline going to handle?
- What can it say or promise?
- What must it never do?
- When should it bring in a human?
- What integration does it need to succeed?

Create Agent must stay short: name, role, voice, personality, and starting brief. Heavy configuration belongs in Training.

### Custom agent standard

"Make your own" is a first-class role, not a dead-end option. It must:

- require an operating brief;
- persist the brief to Training immediately;
- produce saved rules and facts from that brief;
- show the customer what remains incomplete;
- give them a direct way to correct the agent after its first interaction.

### Returning user standard

On return, the product should surface the next best operational action:

- an unresolved follow-up;
- a missed call or failed handoff;
- an agent awaiting Training or review;
- a newly connected integration that needs mapping;
- an outcome that needs approval.

Avoid returning users to a blank builder, a generic dashboard, or an endless settings list.

## 5. UX standard

Wireline should feel calm, operational, and legible.

- One dominant action per screen.
- Plain language over platform jargon.
- Visible saved state and readiness.
- High contrast on every CTA, error, input, and focus state.
- No gradients, purple bleed, decorative dashboards, or hidden configuration.
- Desktop and laptop are primary; mobile remains fully usable for creation and review.
- Integrations are optional and contextual: only recommend a connection when it unlocks a stated job.

## 6. Commercial model

### Pricing principles

- Personal is light-use call delegation.
- Business is the business entry point and should be visibly recommended.
- Templates are unlocked.
- Customers subscribe to operating capacity.
- Live work is funded through Conversation Balance.
- Avoid "unlimited" claims until the usage ledger and rating path prove margins.

### Sales motion

- Self-serve for Personal and early Business.
- Concierge onboarding for multi-location, regulated, high-volume, and custom-routing accounts.
- Sell a measurable operational outcome: answered calls, booked appointments, recovered leads, response time, or reduced hold time.

## 7. Marketing system

### Public homepage

Lead with the personal proof case because it is immediately understood: "Have Wireline call the pharmacy."

Immediately below, bridge to Business:

> Need every customer call handled? Wireline gives your business an AI front office.

### Proof hierarchy

1. Live demo call.
2. Outcome screenshots: booking, resolved issue, lead capture, follow-up.
3. Customer stories with numbers.
4. Security, reliability, and integration proof.
5. Founder and operator credibility.

Never lead with model names or provider logos. They are implementation detail, not the customer's job.

## 8. Quality and safety gates

No production release passes without:

- successful build and server import;
- production health endpoint response;
- tenant-scoped data reads and writes;
- table privileges verified for the application role;
- Stripe checkout and webhook idempotency verified;
- a completed Create -> Train -> Run flow;
- a completed custom-agent brief flow;
- one real integration connection path;
- visible error, loading, empty, and disconnected states.

## 9. Immediate launch sequence

1. Keep Personal and Business as the only prominently marketed entry points.
2. Dogfood the founder path end to end: create agent, train, connect Google, simulate, review.
3. Apply and verify production database grants and migrations before onboarding more customers.
4. Keep public entry points broad, then use vertical pages as optional proof routes for high-intent buyers.
5. Record three short demo calls showing a real before and after outcome.
6. Add a weekly operating review: activation funnel, completed interactions, errors, cost, and top objections.
