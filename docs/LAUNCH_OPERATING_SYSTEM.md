# Wireline Launch Operating System

## 1. Category and promise

Wireline is **AI call coverage**.

It gives people an assistant that handles time-consuming calls and gives businesses an AI front office that answers, qualifies, routes, follows up, and records what happened.

The category is not “an AI chatbot,” “a model picker,” or “a telephony API.” The customer outcome is simple:

> Every important conversation is handled, tracked, and moved to a useful next step.

## 2. Product segmentation

### Personal

**Customer:** a busy individual who loses time to routine calls, hold queues, scheduling, and follow-up.

**Promise:** “Wireline makes the call, waits on hold, and texts you the answer.”

**Activation event:** the customer creates one assistant, gives it an operating brief, and completes or reviews its first real call.

**Core surface:** one assistant, one number, a concise call feed, and obvious follow-up.

### Business

**Customer:** an owner or operations lead at a service business that misses calls, loses leads, or cannot maintain reliable front-office coverage.

**Promise:** “Every inbound conversation gets a professional next step.”

**Launch wedge:** local service businesses first: home services, clinics, med spas, legal intake, property management, restoration, and hospitality.

**Activation event:** the team connects its calendar or inbox, configures routing and escalation, then handles a real inbound call with a recorded outcome.

**Core surface:** agent roster, routing, training, inbox/outcomes, quality review, and operator controls.

## 3. Product loop

Every screen must reinforce this sequence:

1. **Build** — create an agent from a role or a custom operating brief.
2. **Train** — turn natural-language instructions into rules, facts, tone, and handoff behavior.
3. **Connect** — add only the services required for the job.
4. **Run** — take or place calls, send messages, schedule, and route exceptions.
5. **Review** — show outcome, transcript/summary, missed information, and next action.
6. **Improve** — feed corrections back into the exact agent that produced the interaction.

A feature that does not strengthen one of these moments is not launch-critical.

## 4. Onboarding standard

### First session

The first session must answer five questions in under five minutes:

- What is Wireline going to handle?
- What can it say or promise?
- What must it never do?
- When should it bring in a human?
- What connection does it need to succeed?

The Studio must never make a new user choose a model, inspect raw prompt settings, understand provider routing, or configure every integration before value appears.

### Custom agent standard

“Make your own” is a first-class role, not a dead-end option. It must:

- require an operating brief;
- persist the brief to Training immediately;
- produce saved rules and knowledge from that brief;
- show the customer what remains incomplete;
- give them a direct way to correct the agent after its first interaction.

### Returning user standard

On return, the product should surface the next best operational action:

- an unresolved customer follow-up;
- a missed call or failed handoff;
- an agent awaiting training/review;
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
- Business Studio is the business entry point and should be visibly recommended.
- Extra agents are expansion revenue, not a punitive hard cap.
- Voice minutes and overage rates must clear the declared variable-cost reserve.
- All public price, billing catalog, structured metadata, and checkout labels must match.

### Sales motion

- Self-serve for Personal and early Business Studio.
- Concierge onboarding for multi-location, regulated, high-volume, and custom-routing accounts.
- Sell a measurable operational outcome: answered calls, booked appointments, recovered leads, response time, or reduced hold time.

## 7. Marketing system

### Public homepage

Lead with the personal proof case because it is immediately understood: “Have Wireline call the pharmacy.”

Immediately below, create a clean bridge to Business:

> Need every customer call handled? Wireline gives your business an AI front office.

### Business landing pages

Create one page per launch vertical, each with:

- the missed-call or intake problem;
- the specific job Wireline performs;
- the escalation boundary;
- one believable workflow example;
- the implementation time;
- a business-specific CTA.

### Proof hierarchy

1. Live demo call.
2. Outcome screenshots: booking, resolved issue, lead capture, follow-up.
3. Customer stories with numbers.
4. Security, reliability, and integration proof.
5. Founder/operator credibility.

Never lead with model names or provider logos. OpenAI is a capability advantage, not the customer’s job-to-be-done.

## 8. Integration standard

An integration is launch-ready only when it has:

- a real OAuth or credential connection path;
- clear scope disclosure;
- connection-state feedback;
- one customer-visible action it enables;
- a graceful disconnected state;
- an audit or error trail for failure.

Current core connections:

- Google: Calendar, Gmail, contacts.
- Microsoft: Outlook and calendar.
- Voice: Twilio and Vapi execution paths.
- Billing: Stripe entitlements.
- Data: Supabase/Postgres.
- Managed reasoning: OpenAI primary; Gemini fallback.

## 9. Quality and safety gates

No production release passes without:

- successful build and server import;
- production health endpoint response;
- Google, Microsoft, Yahoo, and email/password entry paths reaching their real handlers;
- tenant-scoped data reads and writes;
- table privileges verified for the application role;
- Stripe checkout and webhook idempotency verified;
- a completed first-agent creation flow;
- a completed custom-agent brief flow;
- one real integration connection path;
- visible error, loading, empty, and disconnected states.

## 10. Metrics that determine success

### Activation

- % of new users who create an agent
- % who submit a training brief
- % who connect a required integration
- time to first completed/reviewed interaction

### Product value

- completed calls per active account
- % of calls producing a useful next step
- booking/lead-capture rate
- follow-up completion rate
- human handoff rate and reason

### Retention

- weekly active operators
- returning users who review an outcome
- agent improvements submitted after a real interaction
- business accounts with more than one active agent

### Economics

- contribution margin by plan
- voice cost per completed outcome
- overage adoption
- agent add-on attachment
- business conversion rate from Studio to paid coverage

## 11. Immediate launch sequence

1. Keep Personal and Business Studio as the only prominently marketed entry points.
2. Dogfood the full path with the founder account: create standard agent, create custom agent, train, connect Google, simulate/review a call.
3. Apply and verify production database grants/migrations before onboarding more customers.
4. Create the first two business vertical pages: home services and appointment-driven services.
5. Record three short demo calls showing a real before/after outcome.
6. Add a weekly operating review: activation funnel, completed interactions, errors, cost, and top customer objections.
