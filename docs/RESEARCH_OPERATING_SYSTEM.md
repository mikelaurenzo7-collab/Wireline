# BotBound Research Operating System

This document turns BotBound research into an execution system. It is not a backlog dump. Every item below must improve one of four outcomes:

1. **Trust** — the Bot is safe, reliable, permissioned, auditable, and understandable.
2. **Activation** — a user reaches a trained, testable, useful Bot quickly.
3. **Retention** — the Bot keeps producing measurable value after the first call, text, handoff, or follow-up.
4. **Expansion** — one useful Bot becomes more Bots, surfaces, numbers, teammates, and governed workflows.

The canonical public promise is **Your Bot for calls, texts, and email.** The
public loop is **Build -> Train -> Launch -> Improve**. Technical surfaces may
retain **Create -> Train -> Wire -> Run** and `agent` identifiers where contracts
require them. BotBound is one protected product and workspace across web,
browser, native mobile, and ChatGPT—not a set of audience modes or disconnected
client apps.

---

## Research stance

BotBound should be studied like a regulated communications product, a conversion product, and an AI operations product at the same time.

- Treat voice quality, latency, interruption handling, routing accuracy, call outcomes, and fallback behavior as product quality, not implementation details.
- Treat onboarding, empty states, templates, training, checkout, and phone provisioning as one activation system.
- Treat every public page, metadata surface, app manifest, browser extension screen, mobile shell, and ChatGPT App surface as one brand system.
- Treat every Bot action as permissioned infrastructure: identity, consent, tenant scope, plan scope, audit trail, and reversible failure modes.
- Treat every roadmap bet as a measurable hypothesis with an owner, metric, decision date, and kill criteria.

---

## Highest-leverage research questions

### P0 — launch confidence

| Question                                                                                            | Why it matters                                       | Required evidence                                                                                             | Decision unlocked                                       |
| --------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Can a new user create, train, test, and wire one useful Bot without founder intervention?           | Activation is the product.                           | 10 observed onboarding sessions; time-to-trained-Bot; drop-off points; rage clicks; failed validation events. | Simplify onboarding, templates, and first-run training. |
| Does the Bot behave correctly in real calls under messy caller behavior?                            | Voice trust determines retention.                    | 100-call dogfood set across everyday delegation, owner-operated, front desk, sales, and support use cases.    | Launch readiness for public traffic.                    |
| Are phone provisioning, call routing, SMS, transcripts, and follow-up reliable enough for paid use? | The line cannot feel experimental once live.         | Synthetic probes, provider error taxonomy, end-to-end traces, retry/fallback results.                         | Production launch and SLA posture.                      |
| Is the public story understood in under five seconds on mobile?                                     | Mobile browser is the first impression.              | Five-second tests, first-click tests, mobile scroll maps, CTA comprehension.                                  | Hero/landing iteration and ad readiness.                |
| Are static metadata, runtime metadata, social previews, and installable-app metadata aligned?       | Crawlers and share surfaces see static output first. | Static metadata contracts and Vercel HTML fetch after deploy.                                                 | SEO/social confidence.                                  |
| Do tests actually guard the product promises that matter?                                           | Visual polish can regress silently.                  | CI runs product voice, metadata, authz, CSP, build, server smoke, extension checks, and e2e where practical.  | Safe iteration velocity.                                |

### P1 — monetization and retention

| Question                                                     | Why it matters                                     | Required evidence                                                                                    | Decision unlocked                                        |
| ------------------------------------------------------------ | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Which first Bot is most likely to activate each role cohort? | One generic template weakens conversion.           | Role-starter selection, completion, test-call success, and live wiring rate by cohort.               | Better starters inside the shared onboarding path.       |
| What capacity and price fit owner-operators versus teams?    | Usage and role count vary without requiring modes. | Willingness-to-pay interviews; checkout experiments; usage-margin analysis.                          | Pricing and plan page changes.                           |
| What is the minimum viable analytics loop for the customer?  | Customers need proof the Bot works.                | Interviews; dashboard usage; desired weekly report formats.                                          | Bot outcome summary, weekly recap, and expansion nudges. |
| Which integrations create durable retention?                 | Integrations become switching costs.               | CRM/calendar/email usage, failure rates, support load, retention lift.                               | Integration roadmap.                                     |
| What usage events predict conversion and churn?              | Growth needs leading indicators.                   | Cohort analysis on setup events, call tests, phone wiring, first successful handoff, balance top-up. | Lifecycle email, in-app prompts, and sales handoff.      |

### P2 — defensibility and scale

| Question                                                                                       | Why it matters                                           | Required evidence                                                                            | Decision unlocked                                   |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| What can BotBound learn from every call that competitors cannot easily copy?                   | Moat comes from operational data and workflow memory.    | Bot memory model, safe feedback loops, evaluation rubrics, replayable call datasets.         | Quality flywheel design.                            |
| Which verticals deserve first-class trust packs?                                               | Regulated and high-value buyers need proof.              | Buyer interviews, compliance requirements, objection logs.                                   | Legal, medical, insurance, real-estate trust packs. |
| Should voice synthesis, voice marketplace, or client-specific voices become a product surface? | Differentiation may be voice identity, but risk is high. | Consent/legal review, customer demand, provider quality benchmarks, fraud prevention design. | Voice roadmap.                                      |
| Where should browser, mobile, and ChatGPT surfaces diverge?                                    | Each surface must earn its existence.                    | Usage by surface; task-fit research; support tickets; OS/store constraints.                  | Surface-specific roadmap.                           |

---

## Research lanes and deliverables

### 1. Positioning and ICP

**Current research cohorts:** roles and use cases inside the same BotBound product and workspace.

Study these use-case cohorts separately without creating product or onboarding branches:

1. Everyday delegation: unknown callers, appointments, errands, waiting on hold, reminders, family logistics.
2. Owner-operator: real estate, contracting, consulting, recruiting, legal intake, med-spa, and insurance work.
3. Team SMB: front desk, shared inbox, service booking, support queue, after-hours line.
4. Sales: inbound qualification, outbound follow-up, speed-to-lead, CRM handoff.
5. Call center: triage, overflow, summaries, routing, compliance, QA assist.

Deliverables:

- Segment one-pagers with pains, jobs-to-be-done, triggers, objections, killer demo, proof, plan fit, and integration needs.
- Role proof and starter templates per cohort inside one shared onboarding path.
- Segment-specific call scripts and evaluation rubrics.
- Segment-specific pricing objections and willingness-to-pay notes.

Metrics:

- Visit -> signup by segment.
- Signup -> first Bot created.
- Bot created -> first knowledge source added.
- Training asset -> test call completed.
- Test call -> phone wired.
- Phone wired -> first successful external outcome.

### 2. Product activation

Activation must be measured as a sequence, not a single signup.

Target activation path:

1. Pick the first job or role.
2. Create a draft Bot.
3. Add one knowledge source or rule.
4. Run one simulated/test call.
5. Review transcript and correction.
6. Wire a number or channel.
7. Complete the first real outcome.

Deliverables:

- Activation event taxonomy.
- Funnel dashboard.
- First-run checklist in product.
- Template quality rubric.
- Test-call success scoring.
- Abandonment recovery emails or in-app prompts.

Activation metrics:

- Median time to draft Bot.
- Median time to test call.
- Median time to first live call.
- Percent completing each step.
- First-call success score.
- First correction applied.
- First balance top-up or subscription conversion.

### 3. Agent quality and evaluations

Voice AI quality must be evaluated like a production call center.

Evaluation dimensions:

- Latency: time to answer, first token, turn-taking delay, end-to-end call duration.
- Conversation control: interruption handling, clarification, caller intent detection, silence handling.
- Task success: booking, qualification, routing, note quality, follow-up accuracy.
- Safety: prohibited advice, escalation, consent, recording disclosure, PII handling.
- Brand fit: tone, concision, professionalism, caller confidence.
- Recovery: provider errors, failed tool calls, uncertain knowledge, handoff failures.

Deliverables:

- Golden call suite by segment.
- Red-team call suite for jailbreaks, angry callers, ambiguous requests, urgency, and sensitive data.
- Agent scorecard visible internally.
- Customer-facing transcript coach.
- Automated post-call eval pipeline.

Quality metrics:

- Call answer rate.
- Median and p95 response latency.
- Task completion rate.
- Escalation correctness.
- Caller hangup rate.
- Correction rate after transcript review.
- Repeated failure themes.

### 4. Telephony, SMS, and reliability

BotBound's reliability standard should be closer to communications infrastructure than a normal SaaS dashboard.

Deliverables:

- End-to-end trace ID from inbound call to transcript to follow-up to billing ledger.
- Provider error taxonomy for telephony, voice model, SMS, calendar, CRM, and billing.
- Synthetic call probes every 15 minutes for showcase Bots and at least hourly for key role templates.
- Mapping from internal health to BotBound product messaging and support workflows.
- Runbook for P0/P1 voice degradation.

Metrics:

- Successful call setup rate.
- Failed call reasons by provider and route.
- SMS delivery success.
- Transcript generation success.
- Follow-up delivery success.
- Synthetic probe pass rate.
- Mean time to detect and resolve voice degradation.

### 5. Conversion, pricing, and monetization

Commercial system—one catalog for every use case:

- Free Builder: create, train, and privately simulate one draft Bot.
- Starter, Starter Plus, and Pro: progressively higher live Bot, number, and usage capacity.
- Bot add-ons: increase capacity without changing product or workspace type.
- Scale: custom volume, SSO, audit, telephony, implementation, and support terms.

Deliverables:

- Plan entitlement matrix.
- Checkout QA runbook.
- Margin model by minute, provider, plan, and use case.
- Price sensitivity interviews by live capacity, role count, and support need.
- Checkout experiment backlog.

Metrics:

- Pricing page CTA click-through by plan.
- Signup plan intent vs actual checkout.
- Checkout start -> completed subscription/top-up.
- Balance top-up repeat rate.
- Gross margin per voice minute and per account.
- Expansion from Free Builder to live use, higher capacity, and additional Bots.

### 6. Growth, SEO, and content

BotBound should own practical intent, not generic AI hype.

Content pillars:

1. Phone Bot for owner-operators.
2. Front Desk Bot for appointment businesses.
3. Speed-to-lead Phone Bot for sales teams.
4. AI call overflow and after-hours coverage.
5. Agent training guides and call scripts.
6. Trust, security, and compliance for Phone Bots.
7. Browser/mobile/ChatGPT command surfaces.

Deliverables:

- Programmatic vertical pages only where there is a unique template, call script, proof, and CTA.
- Comparison pages against categories, not just named competitors.
- SEO metadata contract for title, description, canonical, OG, and JSON-LD.
- Demo call library with source attribution.
- Content brief template.

Metrics:

- Organic impressions by segment.
- Landing page conversion by query intent.
- Demo listen rate.
- Signup with wedge attribution.
- Assisted conversions from blog/showcase pages.

### 7. UX, accessibility, and mobile polish

Every surface should obey: short copy, clear next step, no dead controls, no fake affordances, no visual noise.

Deliverables:

- Mobile-first QA checklist.
- ARIA role contract for interactive custom controls.
- Dead-control audit.
- Empty-state copy audit.
- Dialog and overlay stack audit.
- Touch target and viewport audit.

Metrics:

- Mobile conversion.
- Rage clicks and dead clicks.
- Modal abandonment.
- Form validation errors.
- Accessibility violations by severity.
- Time on task for create/train/run.

### 8. Browser extension, mobile, and ChatGPT surfaces

Each surface must have a job:

- Browser extension: explicit page/selection/phone-number handoff into Studio.
- iOS/Android: call-first control, notifications, approvals, widgets, native communication affordances.
- ChatGPT App: account-bound drafting, refinement, and safe private simulation.

Deliverables:

- Surface-by-surface task map.
- Store/reviewer acceptance checklist.
- Permission and privacy policy matrix.
- Shared contract for Bot creation, training, launch, and actions.
- Surface-specific dogfood scripts.

Metrics:

- Extension handoffs to Studio.
- Mobile approvals completed.
- ChatGPT draft-to-product conversion.
- Permission acceptance rates.
- Cross-surface continuation success.

### 9. Security, privacy, and compliance

Trust is a sales feature. Security work must be visible, provable, and operational.

Deliverables:

- Launch security checklist.
- Custom-auth breached-password screening — already enforced for sign-up and password reset (see `docs/security/auth-password-controls.md`).
- Data retention policy for calls, transcripts, recordings, summaries, training uploads, and audit logs.
- Consent and call-recording disclosure policy by jurisdiction.
- Vendor data-flow map.
- Incident response runbook.
- Customer trust pack per regulated vertical.

Metrics:

- Auth/security setting completeness.
- Policy coverage by data type.
- Open security findings by severity.
- Time to revoke a compromised integration.
- Access review completion.

### 10. Developer experience and codebase health

The repo already documents the multi-surface boundary. The next level is making contracts small, fast, and enforceable.

Deliverables:

- Split oversized legacy design checks into focused Vitest contracts.
- Put product voice, metadata, pricing, authz, CSP, and extension checks in CI.
- Add e2e smoke for public landing and create/train/run happy path.
- Track module-size debt and split large components by responsibility.
- Keep generated assets and visual QA output out of git.

Metrics:

- CI pass rate.
- Median CI duration.
- Flaky test rate.
- Number of product contracts guarding core promises.
- Largest file/component size trend.
- Time to safely ship copy/landing changes.

---

## Prioritized execution roadmap

### First 30 days: make the product measurable and safer to change

P0:

1. Ensure CI runs product voice, metadata, static metadata, authz, CSP, build, and server smoke.
2. Add a separate Playwright workflow for homepage e2e and accessibility smoke.
3. Add activation event taxonomy and instrument the first funnel: landing view, role selected, CTA click, signup intent captured, Bot draft created, knowledge added, test call started/completed, and live wiring started/completed.
4. Patch any remaining audience-mode copy so every role enters the same product and workspace.
5. Create synthetic call probe runbook and map the expected trace from call -> transcript -> summary -> follow-up -> billing ledger.
6. Enforce custom-auth breached-password screening before public launch.

P1:

1. Conduct 10 observed onboarding sessions.
2. Build five golden call scenarios per key segment.
3. Add pricing/checkout QA runbook.
4. Add mobile-first QA checklist to release process.

### 31-90 days: improve activation and paid conversion

P0:

1. Build first-run checklist inside product.
2. Add segment-specific onboarding templates.
3. Add post-call coaching loop: transcript -> issue -> suggested correction -> retest.
4. Launch a weekly Bot outcome recap.
5. Build margin dashboard for provider cost, minutes, and plan revenue.

P1:

1. Run pricing interviews by required live capacity, role count, and support need.
2. Add demo call library by segment.
3. Publish high-intent SEO pages only where template and proof exist.
4. Add integration research for Google Calendar, Gmail, CRM, Slack, and vertical systems.

### 91-180 days: build defensibility and enterprise trust

P0:

1. Automate post-call evals and trend reporting.
2. Build customer-facing ROI and missed-call recovery dashboards.
3. Add enterprise trust packs: security, privacy, data retention, audit, telephony, and vendor flow.
4. Add provider fallback policy and runbooks.
5. Build data flywheel: customer-approved corrections improve future templates and evals.

P1:

1. Evaluate voice marketplace/client voice roadmap after legal and abuse review.
2. Expand native mobile approvals and widgets.
3. Expand browser extension from handoff to workflow command center without broad host permissions.
4. Add governed ChatGPT App action expansion only after separate safety review.

---

## Research scoring model

Use this before adding roadmap work.

| Score      | Definition                                                        |
| ---------- | ----------------------------------------------------------------- |
| Severity   | 5 = blocks launch/trust/revenue; 1 = polish only.                 |
| Impact     | 5 = materially improves activation, retention, trust, or revenue. |
| Confidence | 5 = strong evidence; 1 = intuition.                               |
| Effort     | 5 = large/cross-functional; 1 = small patch.                      |
| Risk       | 5 = could break trust/security/reliability; 1 = low-risk.         |

Priority formula:

`Priority = (Severity + Impact + Confidence) - (Effort + Risk)`

Any item with Severity 5 can override the formula.

---

## Current audited findings from this pass

1. The repo has a strong multi-surface boundary: clients must not own provider credentials, billing authority, OAuth secrets, model instructions, or launch authority.
2. Public positioning is now centralized in shared product voice constants and protected by product voice/static metadata tests.
3. Static HTML, runtime metadata, web manifest, and OG image have guardrails against old promise drift.
4. Primary CI still needs stronger coverage for the new product contracts and e2e accessibility smoke.
5. Audience-mode strings must not return; role and use-case proof belongs inside the shared BotBound journey.
6. Pricing direction is coherent but still requires post-deploy checkout, webhook, portal, and billing-status verification before live rollout.
7. Custom-auth breached-password screening is enforced (see `docs/security/auth-password-controls.md`); the Supabase Auth leaked-password advisor WARN is an accepted, non-active-control posture, not an open launch blocker (see `docs/SUPABASE_ADVISOR_POSTURE_2026-07-07.md`).
8. SLA language promises synthetic call probes; the implementation and reporting loop must be verified before using that as a public trust claim.

---

## Non-negotiables

- Do not let any client bypass server-owned auth, policy, billing, prompts, provider keys, or launch controls.
- Do not add broad browser host permissions or background page harvesting.
- Do not sell unlimited voice without a cost ledger and abuse controls.
- Do not ship public launch while core security posture has known dashboard-level gaps.
- Do not let the product revert to generic assistant/dashboard/operator language.
- Do not add new visual systems outside BotBound Letterpress.
- Do not add roadmap items without a metric and a kill criterion.
