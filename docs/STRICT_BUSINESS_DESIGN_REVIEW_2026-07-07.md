# Strict Business / Design Review — 2026-07-07

**Status: historical.** Dated branch-review snapshot; its fixes already
merged and its "Rule:" doctrine is restated in `docs/README.md` and
`CODEBASE_HEALTH.md`.  
**Base:** `a65923464c7eb4122bfa8b4f35feae94aaa98e1e` — `Guard structured log request ID binding`.  
**Branch:** `codex/strict-business-design-audit-a659234`.

## Scope

This pass reviews Wireline with strict launch/business standards across design, UI/UX, branding, pricing, marketing, SEO, features, integrations, AI runtime setup, repo organization, authenticated user flows, and the overall chance of success.

The bar is not "does it work locally." The bar is whether every public and authenticated surface increases trust, makes the product easier to understand, reduces buyer confusion, improves conversion, and keeps the repo aligned around one operating model.

## Verdict

Wireline is no longer a scattered idea repo. It has a real doctrine, a credible design system, meaningful billing/runtime infrastructure, and a product loop that can become memorable:

> **Create → Train → Wire → Run**

The biggest remaining risk is not lack of ambition. It is over-explaining, over-surfacing, and letting stale vendor/comparison claims weaken trust. The product should feel inevitable: one agent, one line, one operating workspace, clear pricing, clean handoffs, visible settings, and no mystery around usage spend.

## High-leverage fixes landed in this branch

### 1. Public product voice tightened around the operating loop

The homepage copy now makes the loop explicit instead of relying on generic proof chips. The hero supports the “WIRE YOUR AGENT” direction while tying the product to concrete user action: create, train, wire, and run.

Why it matters: buyers remember sequences. A product can own a workflow faster than it can own a broad category.

### 2. Homepage SEO sharpened

The homepage metadata and SoftwareApplication schema now use clearer language for personal assistants, call centers, sales teams, and the Create → Train → Wire → Run loop.

Why it matters: the page now targets voice-agent intent while reinforcing the differentiated Wireline model.

### 3. Mobile authenticated navigation made discoverable

The mobile workspace dock now shows labels on phone-width screens instead of hiding them until `sm`. Settings is no longer only an icon, and the user can see Home, Studio, Train, Phone, Wire, Inbox, and Settings.

Why it matters: prior mobile screenshots repeatedly showed confusion around where core surfaces lived. Hidden labels are elegant for known apps, but costly for a new product with unfamiliar IA.

### 4. Pricing page hardened for trust and SEO

The pricing page now adds structured `OfferCatalog` and `FAQPage` JSON-LD while preserving the Conversation Balance + Team/Business capacity model.

Why it matters: pricing is both a conversion page and a trust page. It should be crawlable, parsable, and easy to understand before checkout.

### 5. Named competitor table replaced with durable buyer-decision positioning

The prior pricing page named specific competitors and summarized their posture. That is a trust risk unless constantly re-researched. This branch replaces it with durable buyer alternatives:

- raw voice APIs
- generic call bot tools
- human answering services
- avatar/video tools

Why it matters: Wireline can position aggressively without publishing stale or unverifiable competitor claims.

### 6. Pricing language made less hostile and more enterprise-safe

“Lock-in” became “Retention” and the copy now frames phone numbers, transcripts, playbooks, and outcomes as operating assets instead of sounding like a trap.

Why it matters: enterprise buyers do not want to feel trapped. They want confidence that setup compounds value.

### 7. Homepage rhythm unified around the product loop

The hero proof strip and how-it-works section now share the same Create → Train → Wire → Run sequence. The audience control uses the canonical segmented-control primitive, hero cards use the paper/elevated primitives, and pricing cards now stretch cleanly to a shared baseline.

Why it matters: the product now feels designed from one doctrine instead of assembled from separate marketing blocks.

### 8. Workspace rhythm polish added at the system layer

`workspace-polish.css` now adds shared page rhythm, framed data rows, card border tuning, mobile dock elevation, active mobile-nav affordance, and consistent mobile action clustering.

Why it matters: a small system-level layer improves many authenticated pages without rewriting each route.

### 9. Settings redesigned into a composed surface

Settings now reads as a clean account surface with framed profile rows, compact security rows, clearer destructive-action copy, and a calmer danger zone.

Why it matters: Settings is a trust page. It should look deliberate, not like leftover form controls.

## Strict findings by area

### Design / branding

Strong direction: Wireline Letterpress / Clear System is cohesive and differentiated. The dark, premium phone-operation aesthetic is worth protecting.

Weakness: some public sections still oscillate between luxury editorial copy and SaaS utility copy. The strongest voice is concise, operational, and confident: **Wire your agent. Train the line. Run the work.**

Rule: no new visual systems, no novelty palettes, no decorative feature bloat.

### UI / UX

Strong direction: Overview, Studio, Training, Wire, Phone, Inbox, Apps, Settings is a workable IA.

Weakness: mobile cannot assume users know icons. A new product needs labeled wayfinding until usage frequency proves the navigation is learned.

Rule: mobile authenticated surfaces should prioritize visible labels, short verbs, and fewer long descriptions.

### Pricing / packaging

Strong direction: Personal creation is free; live work is funded through Conversation Balance; Team and Business sell operating capacity.

Weakness: any ambiguous “included minutes” or competitor-pricing language can create buyer skepticism.

Rule: public pricing should say what is true now: plans cover capacity, numbers, routing, approvals, support posture, and reliability; Conversation Balance pays for live usage.

### Marketing / SEO

Strong direction: “WIRE YOUR AGENT” is a memorable command. It fits the product and can carry the brand.

Weakness: generic voice-agent SEO can become commodity language quickly.

Rule: every public page should pair category terms with Wireline-owned language: Create → Train → Wire → Run, Conversation Balance, operating workspace, trained line, call outcomes.

### Features

Strong direction: Twilio-style number provisioning, call logs, inbox, training, billing, browser command, mobile control surfaces, ChatGPT app, and presenter layer form a credible product map.

Weakness: breadth can dilute launch. The wedge should remain: one agent, one line, one clear use case, one visible outcome.

Rule: deepen the phone operation before expanding surface area.

### Integrations

Strong direction: CRM, calendar, browser context, mobile approvals, and ChatGPT workflows are correct expansion lanes.

Weakness: integrations should not be marketed as equal until they have setup flow, status, error state, permissions copy, and outcome proof.

Rule: integration cards need four states: not connected, connected, degraded, and useful recent outcome.

### AI runtime setup

Strong direction: the runtime policy separates managed defaults from explicit advanced overrides. OpenRouter being explicit instead of silently substituted is the right trust posture.

Weakness: public model/vendor names and pricing assumptions must stay conservative unless verified against live provider configuration and current docs.

Rule: customer-facing copy should sell outcomes, not model IDs. Operational docs can track provider choices.

### Repo organization

Strong direction: the docs index, verification scripts, source-control hygiene, route registry, design-token parity, and server bootstrap checks show a mature repo posture.

Weakness: durable strategy docs must avoid becoming a second product surface. If a doc is canonical, link it; if not, mark it historical.

Rule: every new active doc belongs in `docs/README.md`.

## Next strict priorities

1. Run `npm run verify` and then `npm run verify:full` before merge.
2. Mobile visual QA: authenticated dock labels, Overview spacing, Studio create flow, Settings visibility, and pricing page card heights.
3. Pricing QA: confirm Stripe catalog, Conversation Balance rates, and checkout routing match `src/lib/plan-catalog.ts` and live Stripe products.
4. Runtime QA: verify production env keys for OpenAI, Gemini, Vapi, Twilio, Stripe, Resend, Redis, and Sentry; do not add public model claims until verified.
5. Conversion QA: track clicks from hero CTA, pricing CTA, showcase demo, and contact enterprise.
6. Product QA: prove one first-call activation loop end to end — create agent, provision/attach number, train, test call, see transcript/outcome, fund live work.

## Success standard

Wireline wins if the first serious buyer can understand the product in under 30 seconds, create an agent without confusion, wire a number without fear, see a useful outcome after the first call, and trust the usage model before paying more.
