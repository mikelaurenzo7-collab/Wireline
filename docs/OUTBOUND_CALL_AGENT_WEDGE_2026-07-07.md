# Outbound Call Agent Wedge — 2026-07-07

**Status:** Active wedge strategy.  
**Branch:** `codex/strict-business-design-audit-a659234`.

## Decision

Wireline should lead with **outbound call agents** without becoming outbound-only.

The marketable wedge stays narrow and sharp:

> **Outbound-first: List → Script → Dial → Log**

But the product must clearly support three user-selectable call directions:

1. **Outbound** — list, script, dial, log.
2. **Inbound** — route, answer, resolve, log.
3. **Hybrid** — answer, act, follow up, sync.

Outbound is the go-to-market edge because it has an immediate business story: there is a list, a reason to call, a desired outcome, and a measurable result. Inbound and hybrid remain first-class because many real customers need agents that answer callbacks, handle front-desk work, triage support, qualify inbound leads, schedule, and make follow-up calls in the same workflow.

## Why outbound is still the best wedge

### 1. ROI is visible

Inbound coverage is valuable, but buyers often experience it as insurance: “maybe we missed fewer calls.” Outbound creates visible work: calls attempted, contacts reached, meetings booked, payments promised, surveys completed, customers recovered, rates negotiated, and next steps logged.

### 2. The user can bring a list

Outbound starts with an asset the buyer already understands: leads, customers, accounts, overdue invoices, dormant users, appointments, renewals, vendors, or providers. That makes onboarding concrete.

### 3. The output is operational, not magical

The agent does not need to claim vague “AI transformation.” It calls, follows the script, handles objections, escalates when needed, logs the result, and queues the next action.

### 4. Wireline already has template depth

The repo already contains serious playbook overlays for:

- SDR outbound prospecting
- Late-stage sales closing
- Inbound lead qualification
- Tier-1 phone support
- Soft collections
- Hard collections / recovery
- Marketing re-engagement
- NPS and feedback calls
- Personal errand calls
- Personal bill negotiation

That means the wedge is not invented from marketing. It is already latent in the product system.

## Agent direction model

| Direction | Loop | Best for | Proof moment |
| --- | --- | --- | --- |
| Outbound | List → Script → Dial → Log | sales prospecting, re-engagement, billing recovery, surveys, reminders, renewals, negotiation | queued list row becomes booked, promised, recovered, callback, no-answer, or escalated |
| Inbound | Route → Answer → Resolve → Log | front desk, inbound sales, support triage, scheduling, overflow, after-hours, callbacks | caller gets a useful answer, booked next step, routed handoff, or clean ticket summary |
| Hybrid | Answer → Act → Follow up → Sync | revenue desk, collections desk, appointment desk, renewal desk, service desk | the same agent answers, calls back, follows up, and keeps the system of record current |

## Positioning

### Primary line

**Outbound agents that actually call.**

### Secondary line

Wireline turns call lists into completed outcomes — and can also run inbound or hybrid call roles when the workflow needs both sides of the conversation.

### What to avoid

Avoid leading with “AI SDR” only. That is crowded and too easy to compare against narrow sales-dialer tools. Wireline should own the broader primitive: call work with outcomes.

Avoid leading with “phone agents for everything.” That is true, but too broad for launch.

Avoid implying inbound is secondary-quality. Outbound is the wedge; inbound and hybrid are product modes.

Avoid promising fully autonomous revenue without controls. Call agents require consent, call windows, approved scripts, escalation rules, and visible outcome logging.

## High-value outbound lanes

| Lane | Buyer | Outcome | Why it works |
| --- | --- | --- | --- |
| Sales SDR | founders, sales teams, agencies | qualified meetings | obvious budget, clear success metric, CRM tie-in |
| Marketing re-engagement | SaaS, services, local businesses | recovered customers / booked demos | warm lists convert better than cold unknowns |
| Billing recovery | clinics, SaaS, service businesses, finance ops | payment promise / payment link | painful manual work, strong ROI, compliance moat |
| Customer feedback / NPS | operators, support teams, agencies | structured feedback + verbatim quotes | short calls, high learning value, easy proof |
| Appointment reminders / scheduling | healthcare, salons, home services, field services | confirmed appointment / reschedule | repetitive calls, direct revenue leakage reduction |
| Renewals / retention | SaaS, memberships, agencies | renewal intent / save opportunity | clear account list, clear human handoff |
| Personal negotiation | consumers / professionals | lower bill / confirmed terms | visceral demo, strong personal assistant story |
| Vendor follow-up | individuals + businesses | answer captured / next step confirmed | broad, high-friction, defensible assistant use case |

## High-value inbound and hybrid lanes

| Lane | Direction | Buyer | Outcome |
| --- | --- | --- | --- |
| Front desk | Inbound | local services, clinics, agencies, SMBs | answered call, booked appointment, routed message |
| Inbound lead qualifier | Inbound | sales teams, agencies, marketplaces | fit notes, booked meeting, routed hot lead |
| Support triage | Inbound | SaaS, e-commerce, service businesses | resolved question or clean escalation |
| After-hours coverage | Inbound | SMBs, healthcare-adjacent, home services | captured demand outside business hours |
| Revenue desk | Hybrid | sales and revops teams | answer callbacks, qualify, book, follow up |
| Collections desk | Hybrid | finance ops, clinics, service businesses | answer disputes, make reminders, log promises |
| Appointment desk | Hybrid | healthcare, salons, field services | answer requests, call no-shows, reschedule |
| Renewal desk | Hybrid | SaaS, memberships, subscriptions | answer questions, call expiring accounts, save churn |

## Product doctrine

Outbound product surfaces should organize around the wedge loop:

1. **List** — who to call, why they are being called, consent/source, priority, attempt status.
2. **Script** — opener, qualification, objections, compliance language, approved offers, escalation rules.
3. **Dial** — schedule, number, cadence, live call, voicemail, retries, hold handling.
4. **Log** — outcome, summary, CRM update, payment promise, meeting booked, callback, escalation.

Inbound and hybrid should map to the same underlying operating system, not a separate product:

- Inbound: route, answer, resolve, log.
- Hybrid: answer, act, follow up, sync.

This keeps the platform unified: every mode has a clear input, a trained behavior, a live call, and an outcome record.

## Feature implications

### Must be first-class

- Direction choice: outbound, inbound, hybrid
- Import / create call lists for outbound lanes
- Inbound routing and answer rules
- Campaign or list view with call status
- Approved scripts and objection handling
- Compliance settings by lane
- Call windows and retry cadence
- Outcome taxonomy
- CRM or workspace logging
- Human handoff / approval rules
- Payment link or meeting booking where authorized

### Should be careful

- Collections and negotiation need explicit compliance disclaimers, permissioning, call windows, identity verification, and “never say” boundaries.
- Sales calls need clear source/consent metadata, do-not-call posture, and human escalation when the contact asks for details the agent cannot answer.
- Personal bill negotiation must never impersonate the user. The agent should openly represent itself as calling on behalf of the user.
- Inbound support and healthcare-adjacent scheduling need strong escalation rules and no unsupported legal, financial, or medical advice.

### Can wait

- Avatar/presenter marketing for call agents is secondary.
- Browser extension is a useful command surface, but not the wedge.
- Broad “call center for everything” messaging can wait until outbound proof and hybrid workflows are strong.

## Demo path

The best demo is not a generic chat.

1. Choose a mode: outbound, inbound, or hybrid.
2. Pick a lane: SDR, re-engagement, collections, survey, front desk, support triage, scheduling, or negotiation.
3. Show the script, answer rules, handoff rules, and guardrails.
4. Dial or answer one test call.
5. Show transcript, summary, outcome tag, and next action.
6. Show the list, inbox, CRM, or workspace updated in real time.

The magic moment is not the voice. The magic moment is the outcome row changing from **Queued** to **Booked**, **Promised**, **Recovered**, **Answered**, **Resolved**, **Callback**, or **Escalated**.

## Pricing implication

Keep the current plan model, but explain it through call-lane capacity:

- Personal: create/train one agent; live outbound, inbound, or hybrid work uses Conversation Balance.
- Team: one focused call lane with shared inbox, routing, approvals, and included numbers.
- Business: multiple call lanes, more agents/numbers, CRM sync, analytics, roles, approvals, and campaign oversight.
- Enterprise: compliance review, SSO, BYO telephony, custom workflows, committed usage, and implementation support.

## Success metric

Wireline wins the wedge when a buyer can say:

> “I chose the call direction, trained the role, it handled the call, and I got outcomes back.”

The first hard KPI is not generic engagement. It is **completed call outcomes per funded dollar**.
