# Aurora Masterplan — Brand, Growth, and Product Execution Plan

**Status:** Active
**Owner:** Product, design, growth, and engineering leadership
**Companion to:** [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md) (audit + KPI targets), [business-usage-pricing-decision.md](./business-usage-pricing-decision.md) (billing model), [PRESENTER_VENDOR_STRATEGY.md](./PRESENTER_VENDOR_STRATEGY.md) (avatar/video), [CLIENT_SURFACES.md](./CLIENT_SURFACES.md) (surface ownership)

This document is the execution companion to the Aurora visual rebrand (violet action / silver wire / obsidian canvas, dark-first with a matching light mode). It does not repeat the token-level design system spec — see `design-tokens/wireline.tokens.json`, `src/lib/wireline-design-vision.ts`, and `CODEBASE_HEALTH.md` for that. This document covers everything the rebrand should be _in service of_: brand voice, marketing, onboarding, pricing, voice/avatar product surface, and operational maturity. Steps are ordered by leverage, not by calendar — pull whichever is unblocked and highest-impact next.

---

## 1. Brand & voice system (beyond color)

The palette change is an opportunity to tighten brand voice consistency, not just hex values.

1. **One-line positioning to memorize:** _"Wire your agent — trained voice agents that answer, route, book, and follow up, with an optional live face."_ Every surface (`MARKETING_VOICE`, extension hero, App Store copy, sales deck) should trace back to this sentence. Audit `src/lib/product-copy.ts` for drift and consolidate any duplicated hero copy into `MARKETING_VOICE`/`WORKSPACE_VOICE` if not already centralized.
2. **Naming discipline:** keep `Agents`, `Training`, `Wire`, `Studio`, `Conversation Balance`, `presenter`/`face`/`live video add-on` as the only customer-facing nouns (already enforced by `check-wireline-clear-system.mjs` — extend the contract if new surfaces are added rather than drifting).
3. **Visual voice under Aurora:** violet reads as _modern, confident, premium AI_ (aligns with category leaders); silver reads as _precision instrument_, not decoration — reserve it for the wire motif (rules, node dots, focus-adjacent accents), never as a second competing accent color. Write this rule into any future design-system onboarding doc for new contributors.
4. **Motion signature:** the existing `wl-wire-pulse` traveling-signal animation is a strong, ownable brand motion. Extend it deliberately to: the Studio "agent is thinking" state, the call-connecting state, and the presenter hand-off moment — but nowhere else, so it stays special-occasion rather than ambient noise.
5. **Sound (new):** if any product surface adds audio cues (call-connected chime, notification tone), commission one short, ownable sound identity matching the calm/precise/useful tone — do not ship default OS chimes.

## 2. Marketing site & GTM

1. **Hero and OG assets:** the OG image and hero now carry Aurora — verify Facebook/Twitter/LinkedIn card caches are purged (`https://developers.facebook.com/tools/debug/`, X Card Validator) after merge so shared links stop showing the cached green/copper preview.
2. **Comparison page (`/compare`):** refresh screenshots/illustrations referencing old chrome; audit for any embedded PNG/JPEG (not live-rendered) marketing assets that still bake in the old palette — those won't be caught by the design contract because it only checks source, not static exported images.
3. **Positioning matrix:** `WIRELINE_2026_ROADMAP.md` §2 is the canonical competitive table (Wireline vs. Retell/Vapi/Synthflow/Bland/Synthesia/HeyGen). Keep the "live voice + live presenter in one console" differentiation as the primary wedge — it is defensible and not trivially copyable.
4. **Channel strategy:**
   - **SEO/content:** vertical landing pages (`VerticalLanding.tsx`) already exist per-industry — prioritize the 3–5 verticals with the clearest ROI story (medical/dental front desk, real estate, home services, legal intake, e-commerce support) and produce one deep case-study-style page per vertical with a concrete before/after script excerpt.
   - **Paid:** the FB Pixel + GTM wiring already exists in `index.html` — confirm conversion events fire on `agent-created`, `first-call-made`, and `upgrade-to-paid` (already named in the roadmap's instrumentation section) so paid spend can optimize on activation, not just signup.
   - **Founder-led / organic:** the "Wire your agent" line and the phone-agent visual demo (`BrowserCallWidget.tsx`) are strong founder-demo material for short-form video — a live browser-call demo converts better than static screenshots for this category.
   - **Partnerships/affiliates:** vertical SaaS tools each ICP already uses (scheduling software, CRMs, EHR-adjacent tools for medical) are natural integration/co-marketing partners once Wire (`/connections`) supports them.
5. **Trust and proof:** `TrustSignals.tsx` should carry real, current logos/metrics only — remove or gate any placeholder proof before wider paid spend, since fabricated social proof is a conversion-destroying credibility risk once traffic scales.
6. **Referral loop:** Conversation Balance is a natural referral hook — "refer a business, both get $X in balance." Not yet evident in the codebase; worth a dedicated spec once activation metrics stabilize.

## 3. Onboarding & first-time user experience (FTUE)

The existing `Create -> Train -> Wire -> Run` loop with `PostCreateActivationWizard.tsx` (Train → Channels → Wire → Test) is the right shape. Sharpen it:

1. **Time-to-first-value:** the fastest path to "wow" is hearing/seeing the agent work, not configuring it. Confirm the wizard's **Test** step (RoleplaySandbox) is reachable in the fewest possible clicks from signup, and that it defaults to a working demo persona so a brand-new user can hear the agent talk before they've written a single instruction.
2. **Progressive disclosure, not a form:** Create should stay a short intake (name, role, voice, personality, starting brief) exactly as documented — resist scope creep back toward a multi-field form. Training is where depth belongs.
3. **Empty states as onboarding, not dead ends:** every list/empty state (`wl-empty`, `SignalFrameRail`) should carry one clear next action tied to the current wizard step, not generic "no data" copy.
4. **First-session checklist:** surface a lightweight, dismissible checklist on Overview for the first N sessions — "Agent created → Trained with a source → Number wired → Test call placed → Live call received" — each item deep-links into the exact surface. This turns the activation funnel into a visible, satisfying product surface instead of a silent backend funnel.
5. **Aha-moment instrumentation:** confirm `agent-created`, `first-call-made`, and `upgrade-to-paid` events (named in the roadmap) are actually emitted end-to-end, and add `first-training-source-added` and `first-number-wired` as intermediate funnel events — without these, activation drop-off is invisible.
6. **Business vs. Personal branching:** `AuthPortal.tsx` already persists `preferredPlanId` from the signup workspace choice — make sure the wizard copy and default persona differ meaningfully between the two (Business defaults toward a front-desk/sales persona with Wire emphasized; Personal defaults toward a private-assistant persona with Training emphasized), so the very first agent already feels tailored rather than generic.
7. **Recovery path:** if a user abandons mid-wizard, the "Continue now" manual fallback already exists per the design contract — confirm it's paired with a re-engagement email/push after a short idle period, so activation isn't purely session-bound.

## 4. Pricing strategy

Current model (Personal free-create + Conversation Balance; Team/Business monthly capacity; Enterprise contract) is sound. Refinements to evaluate:

1. **Make the free tier's value obvious before the paywall.** Personal should let a new user build, train, and _simulate_ an agent with zero payment friction — the paywall should appear only at the moment of real telephony usage (live number, outbound minutes), which is exactly where Conversation Balance already sits. Confirm no earlier soft-paywall regressed this (the design contract explicitly forbids reviving retired trial/Starter/Pro copy — keep it that way).
2. **Usage-based upsell surfacing:** when a Team/Business customer is trending toward their plan's included capacity, prompt proactively (in-app + email) with a one-click capacity upgrade rather than a hard stop — reduces churn-by-surprise and increases expansion revenue.
3. **Presenter/live-video as a distinct add-on SKU:** per `PRESENTER_VENDOR_STRATEGY.md`, keep the live face as a metered add-on rather than bundling it into base tiers — it has real per-minute vendor cost and should scale with usage, not flatten margin on customers who never use it.
4. **Annual commitment discount:** if not already in the Stripe catalog, an annual option at a modest discount (~15–20%) on Team/Business improves cash flow and reduces monthly churn surface — verify against `stripe-catalog-proposal.json` and the live Stripe catalog via `npm run stripe:catalog:check`.
5. **Enterprise packaging:** formalize what "Enterprise" unlocks beyond price — SSO, custom telephony, dedicated support, security review, and any high-volume Conversation Balance rate — so sales conversations have a consistent, defensible feature/price matrix rather than ad hoc negotiation.
6. **Vertical-specific bundles:** for the highest-intent verticals (medical/dental front desk, real estate), consider a named bundle (agent + template knowledge pack + recommended integrations) at a fixed price — packaging convenience often outsells itemized usage pricing for less technical buyers.

## 5. Voice agent features, voices, and customization

1. **Voice library breadth:** audit the current voice catalog (`src/lib/ai-models.ts`, `src/lib/voice/`) for coverage across gender, accent, age, and language — a front-desk/medical persona and a private-assistant persona benefit from different voice registers; make sure the picker groups voices by _use case_ (e.g., "Warm front desk," "Sharp sales concierge," "Discreet personal assistant") rather than a flat alphabetical list, mirroring the personas already defined in `AGENT_IDENTITY_PERSONAS`.
2. **Tone and behavior controls:** expose the `promptDirective` concept (already modeled per persona in `agent-identity.ts`) as a lightweight, user-facing tone slider or preset picker in Training — "Warm ↔ Direct," "Concise ↔ Detailed" — rather than requiring free-text prompt editing for basic tone shifts.
3. **Multi-lingual support:** if the target ICPs include Spanish-first or bilingual customer bases (very likely for home services, medical, and hospitality verticals in the US), prioritize a first-class bilingual/language-detection path over the current English-first assumption baked into onboarding copy.
4. **Latency tiers and honesty:** the roadmap already targets <250ms perceived turn-taking. Keep the "PSTN presenter voice falls back to voice library, disclosed in voice picker" honesty pattern for _every_ provider fallback — never silently swap voice/model without disclosure, since a customer catching a silent downgrade erodes trust fast in a voice-identity product.
5. **Voice cloning / custom voice (future):** if pursued, gate behind explicit consent language and a clear "this is a custom voice, not a vendor stock voice" customer-facing label, consistent with the existing vendor-name-hiding discipline for video presenters.

## 6. Avatar / live video presenter and runtime setup

1. **Fallback face polish under Aurora:** `faceConfigFor()` now draws its background gradients and accent color from the Aurora palette (violet/silver/obsidian) instead of patina/copper/ink — visually QA the generated faces across all 5 ground gradients × 2 accents × 6 hair styles to confirm no accent collides awkwardly with a skin tone at low contrast.
2. **Vendor abstraction discipline:** keep `VIDEO_PRESENTER_PROVIDERS` and `AgentIdentityPersona.surfaceLabel` as the only customer-visible layer — HeyGen/LiveAvatar/Tavus/D-ID/Simli names must never leak into customer UI, consistent with `PRESENTER_VENDOR_STRATEGY.md`.
3. **Consent and metering UX:** every live-video session should show a lightweight, persistent "Live video — [status] · [approx. cost/min]" indicator during business-agent calls so presenter usage never feels like a hidden meter running in the background.
4. **Runtime performance:** presenter lip-sync currently uses an MP3 decode path plus browser PCM for preview — confirm this degrades gracefully (falls back to the static Wireline face, never a frozen frame or silent error) on low-bandwidth connections, and that the fallback message is honest ("Live video paused — continuing on voice") rather than silent.
5. **CarPlay/Android Auto and native surfaces:** these are voice-only by platform constraint — make sure presenter-related settings are hidden entirely in those contexts rather than shown-and-disabled, to avoid confusing drivers with an unusable toggle.

## 7. Runtime, ops, and platform maturity

1. **Design contract as a living guardrail:** `scripts/check-wireline-clear-system.mjs` is unusually strong for a project this size — keep extending it whenever a new customer-facing surface, copy rule, or brand color is introduced, rather than letting drift accumulate between audits.
2. **Security follow-ups already flagged in the roadmap** (custom-auth breached-password enforcement, production Upstash Redis confirmation, live Stripe webhook proof, `SENTRY_DSN` in Vercel) should be closed before any paid-marketing push — a security incident during a growth spike is far costlier than the fix.
3. **Observability:** confirm `GET /api/health` and Vercel runtime-error review are part of every deploy's post-merge checklist (already documented) — add alerting (not just manual review) once traffic volume makes manual log review unreliable.
4. **Verification discipline for future design/brand changes:** any future palette, typography, or motion change should follow the same pattern used in this rebrand — one token source of truth, a generator, a design contract, and contract tests — never a hand-edited generated file.

## 8. Prioritized action list (no dates — pull the next unblocked, highest-leverage item)

1. Merge the Aurora rebrand once CI (`verify-build`, `verify-full`, `product-contracts`, `accessibility-*`) is green.
2. Purge social-preview caches for the OG image; audit `/compare` and any static marketing screenshots for stale chrome.
3. Instrument the missing funnel events (`first-training-source-added`, `first-number-wired`) and ship the first-session activation checklist on Overview.
4. Close the flagged security follow-ups (custom-auth breached-password enforcement, Redis, Stripe webhook proof, Sentry DSN) before scaling paid acquisition.
5. Group the voice picker by use-case persona and add a tone preset control in Training.
6. Formalize the Enterprise feature/price matrix and evaluate an annual-billing discount in the Stripe catalog.
7. Ship the first vertical deep-dive landing page (pick the single highest-intent vertical first) with a real before/after script excerpt.
8. Spec and prioritize a referral loop against Conversation Balance.
9. Visual-QA the regenerated agent-face gradients across all persona/hair/accent combinations under Aurora.

---

_This document is a living execution companion, not a static audit. Promote decisions made here into `README.md`, `CODEBASE_HEALTH.md`, `ARCHITECTURE.md`, `business-usage-pricing-decision.md`, or `PRESENTER_VENDOR_STRATEGY.md` once implemented, per the documentation hygiene rules in `docs/README.md`._
