# Aurora Masterplan — Historical Brand and Product Execution Plan

**Status:** Historical Aurora implementation context
**Owner:** Product, design, growth, and engineering leadership
**Companion to:** [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md) (audit + KPI targets), [business-usage-pricing-decision.md](./business-usage-pricing-decision.md) (billing model), [PRESENTER_VENDOR_STRATEGY.md](./PRESENTER_VENDOR_STRATEGY.md) (avatar/video), [CLIENT_SURFACES.md](./CLIENT_SURFACES.md) (surface ownership)

> Current product language, packaging, onboarding, and launch posture are
> governed by `LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md`,
> `CUSTOMER_TERMINOLOGY.md`, and `src/lib/plan-catalog.ts`. Earlier
> Personal-versus-Business branching and live-video plans in this document are
> superseded: BotBound now uses one product and workspace, and live talking-head
> video is retired.

This document preserves the execution companion to the Aurora visual rebrand (violet action / silver wire / obsidian canvas, dark-first with a matching light mode). It does not repeat the token-level design system spec—see `design-tokens/wireline.tokens.json`, `src/lib/wireline-design-vision.ts`, and `CODEBASE_HEALTH.md`. Current decisions in the sections below have been updated only where needed to prevent the historical plan from reintroducing retired product modes or features.

---

## 1. Brand & voice system (beyond color)

The palette change is an opportunity to tighten brand voice consistency, not just hex values.

1. **Current positioning:** _"Your Bot for calls, texts, and email."_ Public surfaces use **Bot** or **Phone Bot** and the **Build -> Train -> Launch -> Improve** loop. Technical implementation may retain `agent`, `Create`, and `Wire` where contracts require them.
2. **Naming discipline:** keep `Bot`, `Phone Bot`, `Training`, `Wire`, `Studio`, and `Runtime Balance` as the customer-facing product nouns. Concrete roles describe jobs; they do not create separate products or workspaces.
3. **Visual voice under Aurora:** violet reads as _modern, confident, premium AI_ (aligns with category leaders); silver reads as _precision instrument_, not decoration — reserve it for the wire motif (rules, node dots, focus-adjacent accents), never as a second competing accent color. Write this rule into any future design-system onboarding doc for new contributors.
4. **Motion signature:** the existing `wl-wire-pulse` traveling-signal animation is a strong, ownable brand motion. Extend it deliberately to the Studio thinking state, call-connecting state, and human-handoff moment—but nowhere else, so it stays special-occasion rather than ambient noise.
5. **Sound (new):** if any product surface adds audio cues (call-connected chime, notification tone), commission one short, ownable sound identity matching the calm/precise/useful tone — do not ship default OS chimes.

## 2. Marketing site & GTM

1. **Hero and OG assets:** the OG image and hero now carry Aurora — verify Facebook/Twitter/LinkedIn card caches are purged (`https://developers.facebook.com/tools/debug/`, X Card Validator) after merge so shared links stop showing the cached green/copper preview.
2. **Comparison page (`/compare`):** refresh screenshots/illustrations referencing old chrome; audit for any embedded PNG/JPEG (not live-rendered) marketing assets that still bake in the old palette — those won't be caught by the design contract because it only checks source, not static exported images.
3. **Positioning matrix:** competitor notes in `WIRELINE_2026_ROADMAP.md` are a dated research snapshot, not current positioning authority. Keep live voice plus the trained-Bot operating loop as the primary wedge. Live talking-head video is retired.
4. **Channel strategy:**
   - **SEO/content:** vertical landing pages (`VerticalLanding.tsx`) are proof routes, not the frame for the whole business. Keep the primary site broad, then prioritize deep pages for the use cases with the clearest ROI story: personal call delegation, sales, support, scheduling, call-center overflow, medical/dental front desk, real estate, home services, legal intake, and e-commerce support.
   - **Paid:** the FB Pixel + GTM wiring already exists in `index.html` — confirm conversion events fire on `agent-created`, `first-call-made`, and `upgrade-to-paid` (already named in the roadmap's instrumentation section) so paid spend can optimize on activation, not just signup.
   - **Founder-led / organic:** the "Put Your Bot on the Line" brand line and Phone Bot demo (`BrowserCallWidget.tsx`) are strong founder-demo material for short-form video—a live browser-call demo converts better than static screenshots for this category.
   - **Partnerships/affiliates:** vertical SaaS tools each ICP already uses (scheduling software, CRMs, EHR-adjacent tools for medical) are natural integration/co-marketing partners once Wire (`/connections`) supports them.
5. **Trust and proof:** `TrustSignals.tsx` should carry real, current logos/metrics only — remove or gate any placeholder proof before wider paid spend, since fabricated social proof is a conversion-destroying credibility risk once traffic scales.
6. **Referral loop:** Conversation Balance is a natural referral hook — "refer a business, both get $X in balance." Not yet evident in the codebase; worth a dedicated spec once activation metrics stabilize.

## 3. Onboarding & first-time user experience (FTUE)

The existing `Create -> Train -> Wire -> Run` loop with `PostCreateActivationWizard.tsx` (Train → Channels → Wire → Test) is the right shape. Sharpen it:

1. **Time-to-first-value:** the fastest path to "wow" is hearing the Bot work, not configuring it. Confirm the wizard's **Test** step (RoleplaySandbox) is reachable in the fewest possible clicks from signup and defaults to a working role starter so a new user can hear the Bot before writing an instruction.
2. **Progressive disclosure, not a form:** Create should stay a short intake (name, role, voice, personality, starting brief) exactly as documented — resist scope creep back toward a multi-field form. Training is where depth belongs.
3. **Empty states as onboarding, not dead ends:** every list/empty state (`wl-empty`, `SignalFrameRail`) should carry one clear next action tied to the current wizard step, not generic "no data" copy.
4. **First-session checklist:** surface a lightweight, dismissible checklist on Overview for the first N sessions—"Bot created -> Knowledge added -> Number connected -> Test call placed -> Live call received"—with each item deep-linked into the exact surface.
5. **Aha-moment instrumentation:** confirm `agent-created`, `first-call-made`, and `upgrade-to-paid` events (named in the roadmap) are actually emitted end-to-end, and add `first-training-source-added` and `first-number-wired` as intermediate funnel events — without these, activation drop-off is invisible.
6. **One role-led start:** do not branch signup, workspace creation, or onboarding by Personal versus Business. Preserve paid-plan intent, then let the selected job or role starter tailor the first Bot inside the same workspace.
7. **Recovery path:** if a user abandons mid-wizard, the "Continue now" manual fallback already exists per the design contract — confirm it's paired with a re-engagement email/push after a short idle period, so activation isn't purely session-bound.

## 4. Pricing strategy

Current model: one catalog for every use case—Free Builder, Starter, Starter Plus, Pro, and a custom Scale path. Refinements to evaluate:

1. **Make Free Builder's value obvious before the paywall.** Every user can build, train, and simulate a private Bot before upgrading for a live number and capacity.
2. **Usage-based upsell surfacing:** when a workspace approaches included capacity, prompt proactively with the next catalog tier or Bot add-on rather than a hard stop.
3. **Live Video is retired:** leftover Stripe add-on IDs are webhook-only. Do not re-bundle a talking-head SKU into base tiers or public pricing. Identity badges remain.
4. **Annual commitment discount:** evaluate annual billing only against the current catalog and verified live Stripe state.
5. **Scale packaging:** formalize the custom Scale path—SSO, custom telephony, dedicated support, security review, and high-volume economics—without creating a second product.
6. **Role starter packs:** bundle a starter role, knowledge template, and recommended integrations when evidence supports it; the pack remains a configuration inside the same BotBound product.

## 5. Bot voice, behavior, and customization

1. **Voice library breadth:** audit the current voice catalog (`src/lib/ai-models.ts`, `src/lib/voice/`) for coverage across gender, accent, age, and language — a front-desk/medical persona and a private-assistant persona benefit from different voice registers; make sure the picker groups voices by _use case_ (e.g., "Warm front desk," "Sharp sales concierge," "Discreet personal assistant") rather than a flat alphabetical list, mirroring the personas already defined in `AGENT_IDENTITY_PERSONAS`.
2. **Tone and behavior controls:** expose the `promptDirective` concept (already modeled per persona in `agent-identity.ts`) as a lightweight, user-facing tone slider or preset picker in Training — "Warm ↔ Direct," "Concise ↔ Detailed" — rather than requiring free-text prompt editing for basic tone shifts.
3. **Multi-lingual support:** if the target ICPs include Spanish-first or bilingual customer bases (very likely for home services, medical, and hospitality verticals in the US), prioritize a first-class bilingual/language-detection path over the current English-first assumption baked into onboarding copy.
4. **Latency tiers and honesty:** the roadmap already targets <250ms perceived turn-taking. Browser and PSTN voice use OpenAI Realtime; Twilio owns PSTN/SIP. Never silently swap voice/model without disclosure.
5. **OpenAI-only voice boundary:** launch with the complete 10-voice built-in roster and stable speaker identity per session. Do not add a custom-voice upload, clone, or outside catalog through this plan.

## 6. Avatar / live video presenter (retired)

Live talking-head video is retired. Identity badges and fail-closed compatibility
paths remain; checkout, session minting, and talking-head generation must not be
restored by this plan.

1. **Identity badge polish:** visually QA the static Bot identity treatment for contrast and clarity across supported surfaces.
2. **Vendor isolation:** keep retired provider names and credentials out of customer UI and preserve fail-closed legacy webhook handling.
3. **No active controls:** hide presenter checkout, metering, and session controls rather than showing disabled or suggestive UI.
4. **Native surfaces:** keep CarPlay, Android Auto, and mobile controls voice-first with no presenter settings.

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
6. Formalize the Scale sales path and evaluate annual billing against the current Stripe catalog.
7. Ship the first vertical deep-dive landing page (pick the single highest-intent vertical first) with a real before/after script excerpt.
8. Spec and prioritize a referral loop against Conversation Balance.
9. Visual-QA the static Bot identity badges across public and authenticated surfaces.

---

_This document preserves the Aurora program's decision context. Current work must follow the launch source of truth, customer terminology, architecture, and plan catalog._
