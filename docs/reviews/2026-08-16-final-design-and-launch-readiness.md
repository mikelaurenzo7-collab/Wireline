# Wireline Final Design and Launch Readiness

**Date:** August 16, 2026  
**Validated application head:** `5707de7e2c43999a5c60170907b72ecbe693c634`  
**Working branch:** `codex/consolidated-landing-launch-readiness-20260816`  
**Baseline requested by founder:** `e50509d921b9f88aeb36bf1b82b9eebf88cda253`  
**Disposition:** **Merge GO. Production visual certification pending. Founder-led design-partner launch conditional GO. Broad paid acquisition and cold outbound remain HOLD.**

## Executive decision

Wireline is ready to merge as a coherent release candidate.

The release consolidates public buying content into one continuous landing page, removes public topbar navigation, keeps legal and secondary navigation in the bottom sitemap, preserves fixed viewport ownership for authenticated workspace routes, and corrects the effective font cascade across the web app and ChatGPT widgets.

The code, build, route, security, billing, provider, and operational contracts pass. The exact application head is Vercel READY. Current production health is operational.

The remaining work is evidence, not another broad redesign:

- founder visual QA of the promoted public and authenticated product;
- one complete live paid subscription lifecycle;
- one real non-demo customer call and follow-through workflow;
- support mailbox delivery and response verification;
- signed Resend delivery-event persistence;
- backup and restore drill evidence;
- federal DNC vendor credential before marketing or campaign outbound.

## 1. Release scope

### Public marketing architecture

The public experience now uses one main landing document.

- The topbar contains the Wireline mark, Sign In, and Start Free.
- Public product tabs and the mobile public menu are removed.
- Solutions, features, pricing, trust, live proof, and conversion paths are part of the landing page.
- Bottom sitemap links remain available for legal, support, company, developer, vertical, and detailed product routes.
- The landing page scrolls naturally as a document.
- Other public pages use document scrolling.
- Authenticated workspace routes keep bounded viewport and scroll ownership.
- `/email` remains authenticated.
- Onboarding remains a focused transitional surface and routes into Studio.

### Landing information hierarchy

The landing presents:

1. A concise outcome-led hero.
2. One primary build action.
3. One live proof action.
4. Voice, text, and email as the core channels.
5. A proprietary Wireline console with illustrative workflow proof.
6. Solution paths for sales, service, and all-purpose work.
7. Product capabilities and owner controls.
8. Honest self-serve pricing from the shared catalog.
9. Trust, privacy, and operating boundaries.
10. A compact bottom sitemap.

It removes:

- duplicated landing-style public pages from the topbar;
- borrowed phone or operating-system metaphors;
- fake call duration telemetry;
- unsupported price claims;
- decorative eyebrow repetition;
- optional Live Video clutter from the primary buying story;
- retired trial, overage, employee, and multi-product language.

### Authenticated product surfaces

The design and contract pass covers the current route map and major nested surfaces:

- Overview
- Studio
- Templates
- Knowledge
- Connections
- Phone and call history
- Inbox
- Apps
- Settings and billing
- Team
- Compliance
- Approvals
- Insights
- Admin
- Salesforce integration
- onboarding and activation flows
- create, deploy, trial, and setup dialogs
- shared tabs, menus, sheets, selectors, notices, loading states, empty states, and error boundaries

The release preserves application logic while normalizing:

- workspace height and scrolling ownership;
- safe areas and mobile dock clearance;
- page-frame density;
- tabs and sub-tabs;
- modal overflow;
- responsive card geometry;
- customer-authored casing;
- stale authenticated deep links;
- degraded and unavailable states;
- minimum touch targets and focus behavior.

## 2. Typography correction

The reported dull or fuzzy text had multiple verified causes.

### Root causes

- Later CSS requested synthetic weights such as 650 and 720.
- Those weights were not shipped as static font files.
- Several live-console and badge labels rendered near 10px or 11px.
- A terminal visual tier could override earlier marketing typography corrections.
- Connected ChatGPT widgets repeated the same synthetic-weight and microtype pattern.

### Final type system

Self-hosted fonts remain the source of truth:

- Inter body: 400, 500, 600, 700
- Inter Tight display: 500, 600, 700, 800
- IBM Plex Mono labels: 500, 600, 700

The release now enforces:

- no font synthesis;
- platform text rendering;
- platform font smoothing;
- 700 for the public display hero;
- 600 for shared mono labels;
- 12px minimum for compact labels;
- 13px minimum for captions and disclosures;
- 14px minimum for controls;
- the same static-weight discipline in ChatGPT widgets;
- final import order that prevents later design tiers from undoing the type contract.

The executable Clear System checks these rules.

## 3. Exact release evidence

Exact Vercel deployment for the validated application head:

- Deployment ID: `dpl_HTurjNL3FHswyC48knZfDUe73kLP`
- Preview URL: `wireline-6ded8jben-revaluate.vercel.app`
- State: READY
- Application SHA: `5707de7e2c43999a5c60170907b72ecbe693c634`

| Gate | Result |
| --- | --- |
| Branch divergence from `main` | 54 ahead, 0 behind |
| Test files | 99 passed |
| Tests | 708 passed |
| Operational-core contract | Passed |
| Clear System | Passed |
| Vite production build | Passed |
| Modules transformed | 3,148 |
| Marketing route shells | 29 written |
| Server import smoke | Passed |
| Public-health bundle smoke | Passed |
| Design-token generation | Passed |
| Vercel deployment | READY |
| Manual screenshot certification | Pending |

### Bundle posture

| Surface | Raw | Gzip |
| --- | ---: | ---: |
| Landing route | 15.44 kB | 4.96 kB |
| Main application entry | 165.26 kB | 53.17 kB |
| App shell | 90.86 kB | 28.14 kB |
| Phone page | 54.96 kB | 15.52 kB |
| Vapi runtime chunk | 296.22 kB | 77.27 kB |
| Chart chunk | 363.53 kB | 106.92 kB |
| Live Video presenter chunk | 466.37 kB | 123.80 kB |
| Global CSS | 502.75 kB | 68.06 kB |

The heavier provider and visualization surfaces remain route split. The landing does not pull them into its route chunk.

## 4. Visual certification boundary

No screenshot-based visual certification is claimed yet.

During this pass:

- the browser connector was not attached;
- the protected preview required Vercel authentication;
- the available preview fetch could not complete the interactive SSO redirect;
- the local browser runtime could not reach the protected preview under current network policy.

The next step after merge is founder login through the side-panel browser and live QA of the production build.

Required public viewports:

- 1440 x 900
- 1365 x 900
- 1280 x 800
- 1440 x 720
- 390 x 844
- 360 x 800

Required authenticated routes:

- `/overview`
- `/studio`
- `/templates`
- `/knowledge`
- `/connections`
- `/phone`
- `/phone?tab=logs`
- `/inbox`
- `/apps`
- `/settings`
- `/settings/billing`
- `/settings/team`
- `/settings/compliance`
- `/insights`
- `/admin`

Required interaction review:

- create agent dialog;
- deploy agent modal;
- trial and billing gates;
- phone activation and agent attachment;
- settings tabs and nested controls;
- dropdowns, sheets, selectors, tooltips, menus, and destructive confirmations;
- mobile workspace navigation;
- loading, empty, error, and degraded states;
- long content and modal overflow;
- keyboard focus and escape behavior.

## 5. Current production health

Production currently serves the prior known-good release. It has not yet promoted this branch.

Verified on August 16, 2026:

- `/api/health/public` returned HTTP 200;
- overall service status was operational;
- voice runtime was operational;
- voice fallback was operational;
- reasoning was operational;
- `/api/health/voice-status` returned healthy;
- the reviewed five-minute voice window had zero calls and zero recorded error rates;
- Vercel reported no production warning, error, or fatal logs in the reviewed 24-hour window;
- Vercel reported no runtime error cluster in the reviewed 24-hour window.

A historical Sentry production event on August 9 reported `WL_APP_CLASSES is not defined` on `/phone`. The current branch imports that design-system constant correctly, the production event has not recurred in the current Vercel review window, and the phone route contract passes. The founder session must still exercise `/phone` after promotion.

A development-only August 6 `EADDRINUSE` event is not a production blocker.

## 6. Live product evidence

Production database snapshot on August 16, 2026:

| Metric | Evidence |
| --- | ---: |
| Users | 136 |
| Email-verified users | 7 |
| Users created in last 30 days | 61 |
| Accounts | 137 |
| Organizations | 0 |
| Memberships | 0 |
| Agents | 49 |
| Agents created in last 30 days | 19 |
| Phone numbers | 17 |
| Phone numbers attached to agents | 17 |
| Calls | 114 |
| Demo calls | 114 |
| Non-demo calls | 0 |
| Calls in last 30 days | 45 |
| Non-demo calls in last 30 days | 0 |
| Appointments | 32 |
| Non-demo appointments | 0 |
| Knowledge items | 241 |
| SMS messages | 60 |
| Email messages | 36 |
| Connected email accounts | 0 |
| Connected calendar accounts | 0 |
| Active CRM connections | 0 |
| Voice usage events | 0 |
| Resend webhook events | 0 |
| DNC entries | 15 |

This is strong dogfood and demo evidence. It is not yet customer production proof.

## 7. Billing and Stripe

### Live Stripe configuration

Verified live-mode catalog:

- Starter: $19 monthly, $190 annual
- Starter Plus: $39 monthly, $390 annual
- Pro: $79 monthly, $790 annual

The active $159 compatibility product remains in Stripe but is hidden from public pricing and self-serve checkout. The checkout route returns a retired-plan response for that plan.

Verified live billing infrastructure:

- account display name is Try Wireline;
- production webhook is enabled at `/api/stripe-webhook`;
- webhook events cover checkout, subscriptions, invoices, refunds, disputes, and payment methods;
- customer portal supports payment method updates, invoice history, customer data updates, and end-of-period cancellation;
- portal plan changes are constrained to the intended self-serve catalog;
- privacy and terms URLs are configured;
- checkout and portal return URLs use the production domain.

### Current billing evidence

Stripe currently has zero live subscriptions.

Database subscription rows:

- 3 demo Pro entitlements;
- 1 demo Business Starter entitlement;
- 1 demo Enterprise entitlement;
- 1 additional demo row without a plan/status;
- 1 manual row without a plan/status.

These are not paid customer subscriptions.

The database contains:

- 1 open Starter checkout operation created August 16;
- 1 processed webhook-rotation probe;
- no completed checkout lifecycle evidence;
- no production voice usage events.

Before open self-serve acquisition, complete and record:

1. checkout creation;
2. payment completion;
3. signed webhook ingestion;
4. entitlement activation;
5. invoice and portal visibility;
6. plan change;
7. cancellation at period end;
8. refund or safe test reversal path;
9. account state after each event.

`WIRELINE_SELF_SERVE_BILLING_RELEASE_SHA` should match the exact promoted production SHA only after founder visual QA and billing certification.

## 8. Voice and carrier readiness

Current production voice health is healthy.

Historical demo-line alerts on July 31 and August 7 reported a timeout while resolving one Marcus assistant. Eight of nine lines were healthy. The current canary includes timeout retry protection, and current voice health reports no active degradation.

The canary verifies Vapi number and assistant wiring plus recent health telemetry. It is not a paid synthetic-call certification.

Before accepting production voice dependence:

- place one inbound non-demo call;
- place one permitted outbound non-demo call;
- confirm transcript, summary, outcome, usage, and cost persistence;
- verify owner handoff;
- verify failure and retry behavior;
- verify Twilio funding and number state;
- verify Vapi funding and provider limits;
- verify number release and orphan-resource handling;
- verify monitoring and budget alerts.

## 9. Messaging, email, and compliance

### Messaging

The codebase enforces signed webhooks, consent controls, STOP and HELP behavior, rate limits, retry boundaries, and DNC checks.

`FEDERAL_DNC_API_KEY` remains unavailable. Marketing and campaign outbound must remain fail-closed.

Allowed founder-led pilot motion can focus on:

- inbound calls;
- customer-requested follow-up;
- appointment handling;
- missed-call recovery;
- support;
- consented service communication.

Cold marketing or campaign dialing remains blocked until federal DNC vendor credentials and operating procedures are verified.

### Email

The application contains platform email, customer mailbox, suppression, signed feedback, and fail-closed support controls.

Current evidence:

- zero connected customer email accounts;
- zero recorded Resend webhook events;
- no customer support tickets found in the connected Gmail review;
- support addresses and fallbacks are present in product code.

Required operator test:

1. send a verification or lifecycle email;
2. confirm delivery;
3. confirm signed Resend webhook persistence;
4. verify bounce and suppression behavior using a safe test address;
5. send an external message to `support@trywireline.com`;
6. confirm receipt and reply identity;
7. verify the stated support response process.

## 10. Supabase and data posture

Production Supabase status is `ACTIVE_HEALTHY` on PostgreSQL 17.6.

Verified:

- application and API health are good;
- no current Vercel production database error cluster;
- API health probes returned 200;
- auth logs were empty in the reviewed window;
- performance advisors show unused indexes, which are informational before real traffic;
- the only security advisor item is leaked-password protection for Supabase Auth, while Wireline uses its own application auth path.

Two isolated Postgres query errors requested missing `is_demo` and `plan_id` columns. The actual call-log column is `demo`, and `plan_id` belongs to checkout operations rather than subscriptions. No current application path or Vercel error cluster was found for those queries, so they are classified as audit or probe errors unless runtime evidence proves otherwise.

Historical dead jobs:

- 1 `knowledge_from_url` job on July 22;
- 4 `purge_old_data` jobs from May 23 to May 28.

There are no pending or running jobs in the reviewed snapshot. The historical rows should remain visible as operational debt, but they do not indicate a current queue outage.

Backup and PITR settings are not proven by health status. A documented restore drill remains required before broad launch.

## 11. Security and release controls

The release includes or verifies:

- signed Stripe, Twilio, Vapi, Resend, and managed webhook paths;
- webhook idempotency and replay boundaries;
- SSRF and DNS-pinning protections;
- tenant and account authorization contracts;
- spend and capacity gates;
- rate limits and distributed fail-closed behavior;
- private public-demo tickets and one-use binding;
- data-deletion and export paths;
- auth session revocation and deletion gates;
- preview and production separation;
- migration journal checks;
- public health and source-commit identity;
- no public provider credential requirement for the browser demo;
- no synthetic font weights in the effective design tier.

Repository governance remains weaker than the product gate if `main` is left unprotected. Apply branch rules when available so production changes require review and successful checks.

## 12. Business readiness

Before broad commercial launch:

- confirm the operating entity and EIN;
- align legal entity name across Stripe, terms, invoices, email, carrier accounts, and customer contracts;
- add the correct business tax identity to Stripe when ready;
- verify tax registrations and filing responsibilities;
- verify insurance appropriate to the initial customer cohort;
- document support ownership and incident escalation;
- complete provider budget and funding checks;
- complete backup restore evidence;
- keep demo entitlements and usage separate from customer proof.

## 13. Launch matrix

| Motion | Decision | Basis |
| --- | --- | --- |
| Merge this release candidate to `main` | **GO** | Exact application head is READY and all 708 tests pass |
| Promote the merged tree to production | **GO with immediate smoke** | Production must build from `main` and expose the intended source SHA |
| Founder side-panel visual QA | **REQUIRED** | Screenshot certification was not possible before merge |
| 3 to 5 founder-led design partners | **CONDITIONAL GO** | Allowed after live visual, call, support, and provider checks |
| Open self-serve paid acquisition | **HOLD** | No completed live billing lifecycle |
| Broad paid media | **HOLD** | No non-demo customer outcomes or paid lifecycle evidence |
| Cold marketing or campaign outbound | **HOLD** | Federal DNC credential absent |
| Inbound-first and consented workflows | **CONDITIONAL GO** | Core runtime is healthy; operator certification remains |

## 14. Merge and production sequence

1. Create or update the release pull request from `codex/consolidated-landing-launch-readiness-20260816` to `main`.
2. Confirm branch head and Vercel deployment still match the validated tree.
3. Merge without introducing unrelated changes.
4. Let Vercel build production from `main`.
5. Confirm deployment READY.
6. Confirm the production source-commit header matches the promoted `main` SHA.
7. Run public health and voice-health probes.
8. Confirm no new warning, error, or fatal log cluster.
9. Founder signs in through the side-panel browser.
10. Complete public and authenticated visual QA.
11. Exercise `/phone` and its tabs first because of the historical Sentry event.
12. Fix only verified production defects.
13. Re-run the exact gate for any correction.
14. Complete one live paid lifecycle before enabling open self-serve distribution.

## Final position

Wireline now reflects a deliberate, coherent, industry-grade product and brand system at the code and deployment-contract level.

The next improvement is not more speculative polish. It is live founder QA and controlled production evidence.
