# Wireline Launch Guru Playbook

Updated: 2026-08-11  
Status: **Active founder launch sequence**  
Authority: `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md`

## One-Page Truth

| Area | Current Direction |
| --- | --- |
| Product | Voice agents for personal tasks and business conversations |
| Core loop | Build -> Train -> Launch -> Improve |
| Public hero | Voice Agents |
| CTA | Build your Voice Agent |
| Price line | Build free. Go live from $19/mo. |
| GTM posture | First 3–5 founder-led design partners before scaled acquisition |
| Proof | Real product, exact-production capture, real workflow outcomes |
| WhatsApp | Outside the public launch posture |

## Launch Killers To Clear First

1. **Phone loop:** private test, real inbound/permitted call, follow-up, outcome log, handoff.
2. **Billing loop:** checkout, webhook, entitlement, Customer Portal, cancellation, Runtime Balance behavior.
3. **Creative truth:** exact-production picture, no 404/auth wall/loading hold, current claims and price.
4. **Compliance:** consent, STOP/HELP, DNC posture, calling-hours and outbound safeguards.
5. **Runtime:** exact `main` deployment READY; health operational; error/fatal logs clean.
6. **External provider readiness:** live account identity, funding, carrier status, webhooks, and budgets reverified rather than copied from old snapshots.
7. **Secret hygiene:** revoke or rotate credentials exposed outside approved secret stores.

## Founder Early Access Catalog

The plan catalog in `src/lib/plan-catalog.ts` is the billing source of truth. At this launch snapshot:

| Plan | Monthly | Annual | Agents / Numbers | Live Voice Minutes | Best Fit |
| --- | ---: | ---: | ---: | ---: | --- |
| Free Builder | $0 | $0 | Builder only | 0 | Build, train, simulate |
| Starter | $19 | $190 | 1 | 60 | First live voice agent |
| Starter Plus | $39 | $390 | 2 | 120 | Two useful roles or personal + business |
| Pro | $79 | $790 | 5 | 245 | Growing team / higher volume |
| Business | $159 | $1,590 | 15 | 450 | Multi-role operations |
| Enterprise | Custom | Custom | Custom | Custom | Procurement, scale, negotiated requirements |

Extra-agent and usage economics must be read from the current plan catalog before publication or sale; do not copy this table forward after a catalog change.

## Launch Sequence

### Phase 0 — Founder dogfood

Before inviting a real customer:

- create a clean disposable account and the intended workspace posture;
- build one focused agent;
- train it on real facts, rules, voice, and handoff behavior;
- pass private simulation/test-call proof;
- complete checkout -> webhook -> entitlement -> portal;
- activate the live number;
- handle one real inbound or permitted consented call;
- verify text/email/booking/handoff where the workflow requires it;
- inspect transcript, outcome, billing state, and support recovery;
- record defects against the exact production SHA.

Do not call demo/test activity customer proof.

### Phase 1 — First 3–5 design partners

Choose owner-operated or small-team businesses with a visible missed-call, inbound-response, scheduling, support, or follow-up problem.

For each partner, prove one workflow end to end within seven days:

**Build -> Train -> Launch -> Improve**

Cold marketing outbound is **not** a prerequisite. Federal marketing DNC remains fail-closed until the external credential is configured; start with inbound and consented/non-marketing workflows that can be proven now.

The goal is evidence, not logo count. Founder involvement is expected at this stage.

### Phase 2 — Warm launch

Once multiple partners can complete the core workflow without bespoke engineering:

- publish the founder post;
- publish one exact-production product-proof cut;
- use a current missed-call cut if it passed the creative publish gate;
- drive traffic to the normal public offer, not an invented temporary discount;
- review every signup, failed activation, checkout drop, and first live outcome.

### Phase 3 — Paid test

Start with one narrow campaign only after:

- the advertised workflow has real partner proof;
- phone and checkout paths have been dogfooded on the current production build;
- publishable creative is source-certified;
- carrier/provider readiness supports the traffic being purchased;
- measurement distinguishes demo/test activity from real acquisition.

Scale only after repeated clean outcomes. Do not use ad spend to compensate for unresolved activation or product defects.

## Best First ICPs

Prefer businesses where one conversation can clearly move work forward:

- home services;
- appointment-based local services;
- real estate teams;
- agencies and professional services;
- support-heavy small teams;
- solo operators with visible inbound demand.

Personal use remains part of the product, but first commercial evidence should favor workflows with measurable before/after handling.

## First Offers To Prove

1. Missed-call recovery.
2. Front-desk coverage.
3. Appointment scheduling and follow-up.
4. Lead response and qualification.
5. Support triage and handoff.
6. Personal call delegation where the outcome is concrete.

Do not widen the offer menu until the first repeatable workflow is clear.

## Evidence KPIs

Early targets are diagnostic, not public claims.

Track:

- time from signup to first built agent;
- time to passing private test call;
- checkout completion among users who intentionally choose live use;
- time from paid activation to first useful live outcome;
- follow-up/handoff completion;
- owner review of transcript/outcome;
- support needed to reach launch;
- cancellation/refund reason;
- whether the partner would keep the workflow live at published economics.

Do not promote an internal target to a public performance promise.

## Funnel

`Founder outreach / content -> trywireline.com -> Build free -> Train + simulate -> Paid live activation -> Launch one workflow -> Review outcomes -> Improve -> expand only when useful`

## Messaging Tests

| Angle | Hook | CTA |
| --- | --- | --- |
| Missed call | Every missed call is someone trying the next name on the list. | Build your Voice Agent |
| Personal | Delegate the call and keep control of the outcome. | Start free |
| Business | Give the next important call a trained first response and visible follow-up. | Go live from $19/mo. |
| Expansion | Start with one useful agent. Add more when real work proves the need. | Build your Voice Agent |

All active creative must resolve to **Build -> Train -> Launch -> Improve** rather than introducing a separate workflow slogan.

## Daily Founder Review

Before calling the day launch-ready, verify:

- production `main` is the exact intended SHA and READY;
- public health and voice-status are healthy;
- no new production error/fatal cluster exists;
- required env, dependency-security, and schema gates passed;
- real provider state needed for the next action is current;
- the next customer workflow has been exercised rather than inferred;
- current creative shows the current product;
- customer-facing claims remain supportable without fake social proof.

Fix the failed evidence domain. Do not respond to uncertainty with broad unrelated refactors.
