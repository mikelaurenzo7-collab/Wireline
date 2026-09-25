# BotBound Launch Guru Playbook

Updated: 2026-09-19
Status: **Active founder launch sequence**  
Authority: `docs/LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md`

## One-Page Truth

| Area           | Current Direction                                                       |
| -------------- | ----------------------------------------------------------------------- |
| Product        | Your Bot for calls, texts, and email                                    |
| Public message | Capabilities, outcomes, and a clear signup action                       |
| Public hero    | Your Next Hire Is a Bot.                                                |
| CTA            | Build Your Bot                                                          |
| Price line     | Build free. Plans from $19/mo. Live activation subject to availability. |
| GTM posture    | First 3–5 founder-led design partners before scaled acquisition         |
| Proof          | Real product, exact-production capture, real workflow outcomes          |
| WhatsApp       | Outside the public launch posture                                       |

## Launch Killers To Clear First

1. **Phone loop:** private test, real inbound/permitted call, follow-up, outcome log, handoff.
2. **Billing loop:** checkout, webhook, entitlement, Customer Portal, cancellation, Runtime Balance behavior.
3. **Creative truth:** exact-production picture, no 404/auth wall/loading hold, current claims and price.
4. **Compliance:** consent, STOP/HELP, DNC posture, calling-hours and outbound safeguards.
5. **Runtime:** exact `main` deployment READY; health operational; error/fatal logs clean.
6. **External provider readiness:** live account identity, funding, carrier status, webhooks, and budgets reverified rather than copied from old snapshots.
7. **Secret hygiene:** revoke or rotate credentials exposed outside approved secret stores.

## Founder execution guide

The next milestone is one proven pilot workflow. Paying an invoice, passing local tests or rendering an asset does not open launch by itself. Keep the evidence in one release record with the source SHA, time checked, result and next action. Do not put credentials, full phone numbers or customer transcripts in that record.

### Before funding

- Finish source review, local checks and candidate creative. Keep paid acquisition closed.
- Confirm each vendor's account identity, current invoice or credit balance, pending charges and automatic-recharge behavior. Unknown is not zero; do not budget from an old screenshot.
- Reconcile the existing phone inventory with tenant, Bot, plan, environment and usage. Preserve founder/demo lines until their purpose is verified.
- Select a suitable persistent voice host and confirm its price, WebSocket behavior and drain/termination limits. No host is provisioned by the code change; its cost is additional to web hosting and providers.

### Funding and recovery order

The founder's September 19 plan is to pay verified invoices and fund required accounts after salary the following week. Recheck amounts at payment time; this is a sequence, not authorization for a particular charge.

| Account               | What to verify                                                                                                    | Completion evidence                                                                                                       |
| --------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Vercel                | Canonical project's account restriction, invoice total and billing status                                         | Restriction cleared; exact reviewed preview can build; production subsequently reaches READY with the expected source SHA |
| Twilio                | Spendable balance, pending usage, payment history and auto-recharge; cost and purpose of retained numbers         | Successful funding receipt plus refreshed balance and carrier controls for the intended workflow                          |
| OpenAI API            | Correct organization/project, remaining credit, usage limits and payment method; ChatGPT subscription is separate | API billing and project capacity verified, then private rehearsal and consented call proof                                |
| Persistent voice host | Always-on instance cost, TLS, restart policy and 65-minute drain or safe pre-drain support                        | Reviewed image deployed, worker readiness and configuration agreement verified, long-call and drain tests passed          |
| Supabase              | Project availability, plan invoice and database health/schema                                                     | Read-only health and exact journal/schema checks pass; no blind migration replay                                          |
| Upstash               | Production database, quota, usage and billing method                                                              | Authenticated rate-limit dependency check succeeds with usable capacity                                                   |
| Resend / AgentMail    | Correct sending/mailbox domains, plan limits, invoices and delivery status                                        | Approved transactional delivery, inbound/support reply and webhook handling verified                                      |
| GitHub                | Automation billing/usage and review availability                                                                  | Required jobs run or remain explicitly unpassed; exact-head release/review gates still enforced                           |
| Domain registrar      | Ownership, expiry, renewal and canonical DNS                                                                      | Domain remains controlled and required DNS resolves correctly                                                             |
| Stripe                | Account restrictions, negative balance or failed debits, live prices/portal/webhooks                              | One controlled checkout-to-entitlement, portal/cancellation and reversal lifecycle reconciles                             |

Stripe is not a prepaid runtime account. A zero nonnegative Stripe balance alone does not require a top-up. Do not pay every vendor merely because it appears in this list; pay verified obligations and fund the services required for the approved cohort. Size provider credit against observed call duration, concurrency and usage, with a deliberate budget limit.

### Restore and prove

Follow [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md) for the exact source, preview, read-only provider checks, schema, worker and web deployment sequence. Keep production secrets in the approved server environments. Vercel remains the core launch host; a frontend-only move to another host would leave signup, billing and calls dependent on the same backend.

The worker and web application must agree on the reviewed revision and `OPENAI_SIP_MAX_CALL_SECONDS`. Business calls default to 60 minutes; an explicit old value of 300 still means five minutes. Private rehearsals and message-taking keep their shorter limits. Do not advertise working one-hour calls until a deployed call beyond five minutes, late tool action, handoff and final accounting have passed.

Use this acceptance record for the first clean account:

| Step            | Pass condition                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Build and train | A new user creates a focused Bot, saves knowledge and sees a useful empty state                                         |
| Private test    | Saved voice, business facts, boundaries and handoff instructions work                                                   |
| Activate        | Intended price/interval survives signup; signed payment event posts the right entitlement; owned line becomes active    |
| Call            | One consented non-demo inbound call lasts beyond five minutes and completes its approved task                           |
| Continue        | Configured text/email/booking or human handoff succeeds with relevant permissions                                       |
| Review          | Transcript, outcome, elapsed duration and usage agree; demo activity is labeled                                         |
| Recover         | Retry, unavailable provider, worker drain, support contact and cancellation/refund behavior are understood and verified |

Record actual results and unresolved failures. A simulated checkout, mocked provider or seeded Bot can test behavior but does not satisfy live lifecycle proof.

### Package and publish

Start at [the current asset index](../brand-work/CURRENT-ASSET-INDEX.md), then use [the launch copy kit](../brand-work/gtm/BOTBOUND-LAUNCH-COPY-KIT.md). Keep the first release small:

1. One founder post with one customer problem, one supported product outcome and **Build Your Bot**.
2. One exact-production product cut, with selectable captions and current pricing/availability.
3. One social still for the selected workflow, legible at its actual placement size.
4. One investor/partner one-pager with no fabricated traction or results.
5. One onboarding/support note covering private test, activation, escalation and how to get help.

Use `npm run brand:proof` for the current worktree capture workflow; local proof remains QA-only until exact-production capture and review pass. Before release, check the final file's source/hash, image or video dimensions, text clipping, caption timing, audio rights, real destination and mobile signup path. Generated scenes and illustrative conversations must remain clearly identified; they are not customer recordings. Never infer approval from an `exports` folder or a successful render.

Publish only the items that passed. Keep historical product footage, unverified narration, stale renders and unapproved outbound campaigns held. Invite the first 3–5 partners after the founder workflow passes; measure repeat use and contribution margin before expanding acquisition.

## Commercial Source of Truth

Do not maintain a second hand-written plan catalog in launch documentation.

`src/lib/plan-catalog.ts` owns current plan names, monthly/annual prices, included Bots, number slots, voice minutes, Runtime Allowance, and add-on economics. Public launch copy may state the tested floor **Build free. Plans from $19/mo. Live activation subject to availability.** only while the catalog still supports it.

Before publishing pricing, sending an offer, or briefing paid creative, read the current catalog and run its Stripe/catalog checks. If the catalog changes, update launch copy deliberately rather than carrying an old table forward.

## Launch Sequence

### Phase 0 — Founder dogfood

Before inviting a real customer:

- create a clean disposable account and enter the BotBound workspace;
- build one focused Bot around a real job;
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

**A useful call, a configured follow-up, and a logged outcome.**

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

Everyday call delegation is a valid use case inside the same product. First commercial evidence should favor workflows with measurable before/after handling.

## First Offers To Prove

1. Missed-call recovery.
2. Front-desk coverage.
3. Appointment scheduling and follow-up.
4. Lead response and qualification.
5. Support triage and handoff.
6. Everyday call delegation where the outcome is concrete.

Do not widen the offer menu until the first repeatable workflow is clear.

## Evidence KPIs

Early targets are diagnostic, not public claims.

Track:

- time from signup to first built Bot;
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

`Founder outreach / content -> botbound.app -> Build free -> Train + simulate -> Paid live activation -> Launch one workflow`

After launch, review outcomes for product evidence and support. Owners can adjust or expand when useful; neither is another setup requirement.

## Messaging Tests

| Angle               | Hook                                                                         | CTA            |
| ------------------- | ---------------------------------------------------------------------------- | -------------- |
| Missed call         | When you cannot pick up, give the next caller a useful first response.       | Build Your Bot |
| Everyday delegation | Delegate the call and keep control of the outcome.                           | Build Your Bot |
| Front desk          | Give the next important call a trained first response and visible follow-up. | Build Your Bot |
| Expansion           | Start with one useful Bot. Add more when real work proves the need.          | Build Your Bot |

Keep active creative focused on capabilities and outcomes, without setup-step lists or repeated process slogans.

## Daily Founder Review

Before calling the day launch-ready, verify:

- production `main` is the exact intended SHA and READY;
- public health is healthy and authenticated voice-reliability evidence shows no material degradation;
- no new production error/fatal cluster exists;
- required env, dependency-security, and schema gates passed;
- real provider state needed for the next action is current;
- the next customer workflow has been exercised rather than inferred;
- current creative shows the current product;
- customer-facing claims remain supportable without fake social proof.

Fix the failed evidence domain. Do not respond to uncertainty with broad unrelated refactors.
