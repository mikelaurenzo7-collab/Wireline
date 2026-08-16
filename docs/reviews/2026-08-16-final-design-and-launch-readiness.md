# Wireline Final Design and Launch Readiness

**Date:** August 16, 2026  
**Release candidate:** `eecf0b8b83718fe5a852baf44b0f4f65412ed263`  
**Parent PR:** `#1100` (`claude/wireline-visual-qa-design-hp19br` -> `main`)  
**Disposition:** **Code/design GO; broad production launch NO-GO; founder-led design-partner release CONDITIONAL GO after the operator gates below.**

## Executive decision

Wireline now has a coherent, restrained, production-grade design system and a protected public-demo runtime. The exact release candidate is Vercel READY and CodeRabbit clean. The landing page is no longer a simulated device shell or a compressed SaaS brochure. It is a purpose-built Wireline product theater with visible navigation, one conversion hierarchy, honest economics, core-channel focus, and illustrative outcome proof.

The remaining launch risk is not another design rewrite. It is release evidence and business operations:

- production currently serves a known-good rollback commit rather than GitHub `main`;
- the latest `main` production attempt failed before promotion because a server-only crypto dependency entered the browser graph;
- the certified release candidate fixes that defect and builds cleanly;
- no real paid lifecycle or non-demo customer call has been completed;
- marketing/campaign outbound remains fail-closed until the federal DNC vendor credential exists;
- manual visual certification of the protected preview is still pending because no available runner could both launch Chromium and reach the protected preview;
- support mailbox routing, signed email-delivery feedback, carrier account state, backup/PITR, and restore execution need current operator evidence.

The safe motion is a controlled 3-5 design-partner certification window, not broad self-serve acquisition, paid media, or cold outbound.

## 1. Final design state

### Landing page

The final landing experience now provides:

- the canonical `Voice agents that get the work done` headline and shared supporting line;
- visible desktop and mobile navigation;
- one primary action (`Build Your Voice Agent`), one live-demo action, and one direct pricing path;
- a deliberate narrative/proof split inside an 86rem desktop rail;
- concise plan context: `Build free`, `Launch from $19/mo`, `Number included`, and `View Pricing`;
- a compact `Start With` row for Sales, Service, and All Purpose instead of three competing feature cards;
- a proprietary Wireline Live console instead of borrowed iOS/device metaphors;
- three core launch channels only: Voice, Text, and Email;
- static workflow proof labeled honestly as `Illustrative Workflow`;
- the line `From first answer to confirmed next step.` and the concrete result `Booked and logged`;
- no fake `00:42` telemetry, fabricated customer proof, or optional Live Video clutter in the hero;
- reduced glow, shadow, and decorative intensity;
- readable microcopy and event labels;
- copyright and legal wayfinding instead of a repeated closing claim;
- honest bounded scrolling on short laptops, tablets, and phones rather than clipping content to preserve a screenshot.

### Authenticated product

The broader E2E design pass also:

- consolidates workspace height and scrolling ownership;
- keeps Inbox and route content inside the shared application shell;
- reduces redundant whitespace across Overview, Settings, Billing, Connections, Approvals, Phone, Live Video, Templates, Team, Compliance, and related routes;
- normalizes page-frame density, modal overflow, tab geometry, safe-area ownership, and customer-authored casing;
- raises compressed buying copy to a readable floor;
- restores useful workflow explanation on Features and Solutions;
- keeps public and authenticated surfaces on the same Letterpress design language without rewriting tenant business logic.

### Visual certification boundary

No fresh manual screenshot signoff is claimed.

- The connected Opera browser was unavailable.
- The local Chromium runtime launched, but organization policy blocked the protected preview domain.
- Vercel's build image could not load Chromium because the image lacked `libnspr4.so`.
- The browser specifications remain mandatory on a runner with Chromium system libraries and protected-preview network access.
- Release tooling now reports browser infrastructure as `SKIPPED_RUNNER_UNAVAILABLE` instead of misclassifying it as a product failure.

Required manual viewports before production promotion:

- 1440 x 900 desktop;
- 1365 x 900 desktop;
- 1280 x 800 short laptop;
- 1440 x 720 short/wide desktop;
- 390 x 844 mobile;
- 360 x 800 mobile.

## 2. Protected public-demo runtime

The public browser demo is now bounded as a real production feature rather than an exposed reusable provider credential.

Implemented boundaries:

- one-use, short-lived Wireline-issued tickets;
- host, IP fingerprint, agent, and JTI binding;
- provider access through server-only `VAPI_PRIVATE_KEY`;
- no `VITE_VAPI_PUBLIC_KEY` launch dependency;
- 45-second provider ceiling plus a matching client watchdog;
- distributed admission control that fails closed when the durable limiter is unavailable;
- per-IP burst/daily and global minute/daily session ceilings;
- no recording, video recording, packet capture, provider logging, or transcript retention;
- no real tools, payments, scheduling mutations, owner-routing actions, or external commitments;
- server availability check before microphone permission;
- truthful phone fallback with an accessible name and carrier-rate disclosure;
- readable compact disclosure: `45-second private preview. No retained call artifacts.`

## 3. Exact release-candidate evidence

| Gate | Result |
| --- | --- |
| Candidate SHA | `eecf0b8b83718fe5a852baf44b0f4f65412ed263` |
| Vercel exact-head deployment | READY |
| CodeRabbit | Success |
| Clear System contracts | Passed |
| Full application test suite | Passed |
| Vite production build | Passed |
| Marketing prerender | 29 route shells written |
| Server import smoke | Passed |
| ChatGPT MCP bundle | Passed |
| Public-health bundle smoke | Passed |
| Review threads | None |
| Manual screenshot certification | Pending |

The release candidate's branch alias is:

`wireline-git-claude-wireline-visual-qa-design-hp19br-revaluate.vercel.app`

## 4. Current production truth

### Source/deployment mismatch

GitHub `main` currently points to:

`17727005bbec4feb388a6bed28ecb2878e3a0ea5`

That production deployment failed during Vite compilation because the live-video provider membership helper pulled `auth-utils.ts` and `node:crypto` into the browser bundle. The release candidate moves provider membership into a client-safe module and builds cleanly.

Production is therefore still serving the known-good rollback commit:

`c897d340ae2495403a01398c15ec3f1fec0ee953`

The public health response proves the serving source through `X-Wireline-Source-Commit`.

### Current production health

The serving rollback deployment is operational:

- `/api/health` returns 200 and database health is good;
- `/api/health/public` reports overall, voice runtime, voice fallback, and reasoning as operational;
- `/status`, `/pricing`, `/trust`, `/privacy`, `/terms`, `/support`, and `/` return 200;
- the current serving deployment produced no warning, error, or fatal cluster in the most recent 24-hour log review;
- the authenticated launch-readiness monitor returned 200 during the review window;
- unauthenticated 401 responses from the protected readiness route are expected, not incidents.

### Environment correction

Initial log noise suggested Upstash was absent. Deeper review proved those messages came from integration fixtures that intentionally strip environment variables. The actual production environment gate did not flag Upstash, and the live public-health probe confirms distributed Redis is operational.

The genuine deferred environment item is the federal DNC credential.

## 5. Infrastructure and data security

### Vercel and release boundaries

- production and preview credential isolation is enforced before build/migration work;
- preview deployments do not run production migrations;
- production migration execution is journal-bound;
- browser certification is an explicit runner capability rather than a hidden Vercel assumption;
- production rollback procedures are documented;
- GitHub `main` is currently unprotected, which is a release-governance weakness even though PR review is being used operationally.

### Supabase/Postgres

Production project status:

- `ACTIVE_HEALTHY`;
- PostgreSQL 17.6;
- 49 journaled migrations applied;
- every public table has RLS enabled and at least one policy;
- PostgreSQL logs show normal checkpoints and no database error in the reviewed 24-hour window;
- Supabase API/auth health probes return 200;
- the only security-advisor finding is Supabase Auth leaked-password protection, which is not Wireline's active custom scrypt/HIBP-screened authentication path;
- performance advisors report unused indexes only, expected before customer activation.

Backup/PITR status is not exposed by the connected management tools. It must be verified in the Supabase dashboard, and a restore drill must be executed before broad launch. Do not infer backup readiness from database health.

## 6. Production usage and evidence

Live database snapshot:

| Metric | Current evidence |
| --- | ---: |
| Users | 136 |
| Email-verified users | 7 |
| Workspaces | 137 |
| Agents | 49 |
| Assigned phone numbers | 17 |
| Calls | 114 |
| Demo calls | 114 |
| Non-demo calls | 0 |
| Stripe-bound subscriptions | 0 |
| Connected email accounts | 0 |
| Voice usage events | 0 |
| Recorded Resend webhook events | 0 |

Demo-call quality is promising but not full launch proof:

- approximately 8.5 hours of stored demo calls;
- average duration about 4.5 minutes;
- no recorded STT or TTS errors;
- four pipeline-error records;
- average QA score about 80;
- all calls have summaries;
- 27 calls have structured outcome tags;
- most legacy calls do not have an ended reason;
- recorded provider cost remains zero despite the demo volume.

This supports controlled dogfooding. It does not prove customer activation, full COGS, retention, or production unit economics.

## 7. Billing and commercial readiness

### Stripe technical state

Verified live-mode posture:

- charges enabled;
- payouts enabled;
- no current account requirements due;
- one enabled production webhook for `https://trywireline.com/api/stripe-webhook`;
- customer portal supports payment-method updates, invoice history, customer data updates, end-of-period cancellation, and managed plan changes;
- portal plan changes are restricted and fingerprinted to Starter, Starter Plus, and Pro;
- Stripe Tax calculation is enabled;
- catalog contains the expected $19, $39, and $79 self-serve tiers, extra-agent add-on, Live Video add-on, and prepaid Runtime Balance amounts;
- the active $159 compatibility price is hidden from public checkout/portal and retained for legacy entitlement resolution.

### Commercial evidence still missing

- zero live subscriptions;
- zero PaymentIntents;
- zero available or pending balance;
- no completed checkout -> webhook -> entitlement -> portal -> cancellation lifecycle;
- no active tax registrations;
- Stripe account is still registered under an individual profile with no company tax ID.

Self-serve billing remains runtime-closed unless `WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA` exactly matches the production commit. Set that value only after the final `main` SHA exists and is the intended deployment.

## 8. Voice, messaging, email, and compliance

### Voice

- current production public health reports the primary runtime and fallback operational;
- protected browser proof is now cost/privacy bounded;
- no real non-demo customer call has been completed;
- live provider funding, budgets, alerting, number assignment, retry posture, and carrier dashboards still require operator verification;
- recorded historical demo COGS is incomplete.

### Messaging and federal DNC

`FEDERAL_DNC_API_KEY` remains unconfigured pending the external business/vendor credential. Marketing/campaign outbound therefore fails closed by design.

This does not block an inbound-first design-partner program using:

- inbound calls;
- missed-call recovery;
- appointment handling;
- support;
- customer-requested follow-up;
- properly consented non-marketing flows.

Before production SMS dependence, verify Twilio funding, A2P/toll-free status, STOP/HELP handling, webhook signatures, retry behavior, and number configuration in the live provider dashboard.

### Platform email and support

- required production Resend configuration passed the production environment gate;
- build-time Resend feedback verification passed;
- the signed webhook receiver, suppression behavior, and rollback path exist;
- the database currently contains zero recorded Resend delivery events;
- no connected customer email accounts exist;
- the support form is fail-closed behind distributed rate limiting and always exposes direct email/phone fallback;
- no message containing `support@trywireline.com` was found in the connected Gmail account, so mailbox routing and staffing are not independently proven.

Required tests:

1. send a real verification/lifecycle email;
2. confirm inbox delivery;
3. confirm signed Resend webhook persistence;
4. trigger and verify a bounce/suppression path on a safe test address;
5. send a message to `support@trywireline.com` from an external account;
6. confirm receipt, reply identity, and the one-business-day operating process.

## 9. Legal and business operations

Public trust, privacy, terms, support, and status surfaces are live. The product has strong technical consent, webhook, tenant-isolation, suppression, deletion, spend, and fail-closed controls.

Business-governance work still required before broad commercial launch:

- form/confirm the operating entity and EIN;
- update Stripe from individual to the correct business profile when legally ready;
- obtain qualified tax guidance and add registrations when thresholds/jurisdictions require them;
- confirm the public legal entity name, postal address, and support identity across Stripe, email, terms, invoices, and carrier records;
- verify appropriate business insurance and customer-contract posture for the target cohort;
- obtain federal DNC vendor credentials before any marketing/campaign outbound;
- keep demo/test activity explicitly separate from customer proof.

## 10. Monitoring, incident response, and rollback

Present and verified:

- public status page;
- application/database health;
- public provider health;
- voice reliability surfaces;
- Vercel logs and deployment evidence;
- durable background sweep and daily-brief schedules;
- nightly demo-line canary posture;
- written P0-P3 incident procedure;
- written rollback decision standard;
- data-integrity/security response procedure.

Not independently verified:

- active Sentry DSN and tested destination/routing rule;
- external monitor cadence and alert destination;
- provider-budget alerts;
- backup/PITR settings and a successful restore drill;
- founder support/on-call handoff under a simulated incident.

## 11. Launch matrix

| Motion | Disposition | Reason |
| --- | --- | --- |
| Design system and code candidate | **GO** | Exact-head build/review/security gates pass |
| Merge PR #1100 to `main` | **CONDITIONAL GO** | Requires manual visual signoff and exact release procedure |
| Promote to production | **NO-GO now** | Current production/main mismatch; operator certification sequence not yet executed |
| 3-5 founder-led design partners | **CONDITIONAL GO** | Allowed after the first-customer operator checklist below |
| Open self-serve paid acquisition | **NO-GO** | No live billing lifecycle or customer transaction evidence |
| Broad public launch / paid media | **NO-GO** | No customer proof, manual visual signoff, restore drill, or live lifecycle evidence |
| Cold marketing/campaign outbound | **NO-GO** | Federal DNC credential absent; runtime fails closed |
| Inbound-first / consented design-partner workflows | **CONDITIONAL GO** | Core infrastructure is ready; operator/provider checks remain |

## 12. Ordered founder release checklist

### A. Visual approval

- [ ] Open the exact protected preview on a normal desktop browser.
- [ ] Review 1440 x 900, 1365 x 900, 1280 x 800, 1440 x 720, 390 x 844, and 360 x 800.
- [ ] Verify public header, headline wrapping, CTA hierarchy, economics line, work-lane row, console geometry, demo fallback, legal footer, mobile menu, and internal scrolling.
- [ ] Approve the release candidate without relying on old screenshots or walkthroughs.

### B. Source and production promotion

- [ ] Add/confirm branch protection or repository rules for `main`.
- [ ] Squash-merge PR #1100 only after visual signoff.
- [ ] Record the resulting exact `main` SHA.
- [ ] Configure `WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA` to that exact SHA only when billing certification is intended.
- [ ] Keep `WIRELINE_RECONCILE_STRIPE_PORTAL=true` for the production release.
- [ ] Allow Vercel to build production from `main`; do not promote a preview artifact directly.
- [ ] Confirm production READY and intended aliases.
- [ ] Confirm `X-Wireline-Source-Commit` equals the new `main` SHA.
- [ ] Verify `/api/health`, `/api/health/public`, `/api/health/voice-status`, `/status`, authenticated launch readiness, and fresh production error/fatal logs.
- [ ] Verify the migration ledger and semantic schema effects after promotion.

### C. First real lifecycle

- [ ] Create a clean founder account and verify its email.
- [ ] Create the intended workspace and one focused agent.
- [ ] Train facts, rules, voice, escalation, approval, and handoff posture.
- [ ] Pass a private test call.
- [ ] Complete a live paid checkout.
- [ ] Verify Stripe webhook claim, subscription/entitlement state, portal access, invoice, and cancellation behavior.
- [ ] Claim or connect the live number.
- [ ] Complete one real inbound or permitted consented call.
- [ ] Continue through text/email/booking/approval/handoff where applicable.
- [ ] Verify transcript, summary, outcome, usage, provider cost, and audit records.
- [ ] Verify refund/support recovery on a controlled test if applicable.

### D. Provider and operations checks

- [ ] Verify Twilio funding, A2P/toll-free status, STOP/HELP, callback URLs, and number inventory.
- [ ] Verify Vapi/private runtime funding and budgets.
- [ ] Verify ElevenLabs budget/alerts and approved voice inventory.
- [ ] Verify OpenAI and continuity-provider budgets/alerts.
- [ ] Complete the Resend delivery-feedback and support-inbox tests.
- [ ] Verify Sentry and external-monitor alert delivery.
- [ ] Verify Supabase backup/PITR configuration and complete a restore drill.
- [ ] Run one incident tabletop and one rollback drill against a schema-compatible prior deployment.

### E. Business controls

- [ ] Complete entity/EIN and merchant-profile updates.
- [ ] Confirm tax-registration posture with qualified advice.
- [ ] Verify legal entity, postal address, support identity, invoices, and provider records are consistent.
- [ ] Obtain the federal DNC vendor credential before marketing outbound.
- [ ] Invite only 3-5 founder-led design partners after the gates above.
- [ ] Keep paid media, broad acquisition, and fabricated customer proof off until real evidence exists.

## Final disposition

Wireline is technically ready for final visual approval and controlled production certification. It is not yet evidence-ready for a broad commercial launch.

Do not respond to the remaining blockers with another broad refactor. Complete the exact operator sequence, generate real production evidence, and then expand distribution only as the evidence allows.
