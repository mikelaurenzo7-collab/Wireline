# Outbound Call Agent Wedge — 2026-07-07

**Status:** Active wedge strategy.  
**Branch:** `codex/strict-business-design-audit-a659234`.

## Decision

Wireline should lead with **outbound call agents**.

The platform can still handle inbound, personal assistants, call centers, video presenters, browser command, mobile approvals, and ChatGPT workflows. But the marketable wedge should be narrower and sharper:

> **List → Script → Dial → Log**

Outbound has an immediate business story: there is a list, a reason to call, a desired outcome, and a measurable result. That makes the product easier to sell, easier to demo, easier to price, and easier to prove.

## Why outbound is the best wedge

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
- Soft collections
- Hard collections / recovery
- Marketing re-engagement
- NPS and feedback calls
- Personal errand calls
- Personal bill negotiation

That means the wedge is not invented from marketing. It is already latent in the product system.

## Positioning

### Primary line

**Outbound agents that actually call.**

### Secondary line

Wireline turns call lists into completed outcomes: qualified leads, booked meetings, payment promises, reactivated customers, survey answers, negotiated bills, and logged next steps.

### What to avoid

Avoid leading with “AI SDR” only. That is crowded and too easy to compare against narrow sales-dialer tools. Wireline should own the broader primitive: outbound call work.

Avoid leading with “phone agents for everything.” That is true, but too broad for launch.

Avoid promising fully autonomous revenue without controls. Outbound requires consent, call windows, approved scripts, escalation rules, and visible outcome logging.

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

## Product doctrine

Outbound product surfaces should organize around the loop:

1. **List** — who to call, why they are being called, consent/source, priority, attempt status.
2. **Script** — opener, qualification, objections, compliance language, approved offers, escalation rules.
3. **Dial** — schedule, number, cadence, live call, voicemail, retries, hold handling.
4. **Log** — outcome, summary, CRM update, payment promise, meeting booked, callback, escalation.

This loop is tighter than Create → Train → Wire → Run for the outbound wedge, but it maps cleanly:

- Create = List + agent posture
- Train = Script
- Wire = number, CRM, payment, calendar, approvals
- Run = Dial + Log

## Feature implications

### Must be first-class

- Import / create call lists
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

### Can wait

- Avatar/presenter marketing for outbound is secondary.
- Browser extension is a useful command surface, but not the wedge.
- Inbound call center coverage remains a valuable expansion lane after outbound proof is strong.

## Demo path

The best demo is not a generic chat.

1. Upload a small list of five prospects or overdue accounts.
2. Pick a lane: SDR, re-engagement, collections, survey, negotiation.
3. Show the script and guardrails.
4. Dial one test call.
5. Show transcript, summary, outcome tag, and next action.
6. Show the list updated in real time.

The magic moment is not the voice. The magic moment is the outcome row changing from **Queued** to **Booked**, **Promised**, **Recovered**, **No answer**, **Callback**, or **Escalated**.

## Pricing implication

Keep the current plan model, but explain it through outbound capacity:

- Personal: create/train one agent; live outbound work uses Conversation Balance.
- Team: one focused outbound lane with shared inbox, routing, approvals, and included numbers.
- Business: multiple outbound lanes, more agents/numbers, CRM sync, analytics, roles, approvals, and campaign oversight.
- Enterprise: compliance review, SSO, BYO telephony, custom workflows, committed usage, and implementation support.

## Success metric

Wireline wins the wedge when a buyer can say:

> “I gave it a list, trained the call, it dialed, and I got outcomes back.”

The first hard KPI is not generic engagement. It is **completed outbound outcomes per funded dollar**.
