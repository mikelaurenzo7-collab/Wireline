# Wireline World-Class Elevation — Master Design Document

**Date:** 2026-06-27  
**Status:** Draft for Review  
**Authors:** Grok (following brainstorming + world-class UI/UX + design standards)  
**North Star:** Clean, minimal, beautiful, and functional. Extreme usefulness. Defensible MOATs. Future-proof, versatile, durable, bound-to-be-successful. Flawless across every facet.

## Overview

Wireline is the precision operating system for every important conversation. One trained agent fleet handles calls, texts, email, browser context, and follow-up for personal and business users through a single protected runtime.

The current foundation (Wireline Mono design system, chat-first Studio, Create → Train → Run model, Conversation Balance economics, multi-surface clients) is already disciplined and directionally correct. This master design elevates it to an undeniably world-class level: 

- **Extreme usefulness** for target audiences (busy individuals and service business operators).
- **Defensible MOATs** engineered into product, data, surfaces, and economics.
- **World-class execution** in business plan, branding, marketing, and UI/UX across all web apps and surfaces while staying ruthlessly clean, minimal, and functional.

Every decision prioritizes clarity, outcome velocity, trust, and compounding advantage.

## Background & Current State

- **Product model**: Create (short intake) → Train (first-class) → Run (Studio chat + outcomes + Wire actions).
- **Surfaces**: Web Studio (`src/pages/AgentStudioHome.tsx`, `StudioWorkspaceV2.tsx`, `StudioWorkroom.tsx`, `KnowledgePage.tsx` / `KnowledgeWorkspace.tsx`, `ActionsPage.tsx`), public marketing (PrecisionLanding, Pricing, etc.), browser extension (Wireline Command), iOS/Android (native thin clients), ChatGPT App.
- **Design system**: Wireline Mono — warm off-white canvas (#F7F7F4), strict neutrals, Inter + JetBrains Mono, 4px rhythm, subtle elevation, token pipeline to all platforms (`design-tokens/wireline.tokens.json`, `src/styles/design-system.css`, `src/constants/brand-colors.ts`).
- **Business**: Personal (free create + top-up Balance), Team ($29), Business ($59), Enterprise (contact). Strong server-owned contracts.
- **Strengths**: Restraint, chat primacy, training emphasis, verification culture, visual QA baselines.
- **Opportunities**: Make usefulness visible and extreme; formalize and productize MOATs; raise every surface, narrative, and flow to flawless standards without adding visual noise.

## Goals & Non-Goals

### Goals
- Deliver extreme usefulness: measurably reduce time/friction and increase outcome reliability for Personal and Business users.
- Engineer 5+ durable, defensible MOATs.
- Elevate branding, marketing, and all UI/UX to timeless, world-class clean/minimal standards (Grok-level attention to every detail).
- Make the system future-proof (stable contracts, model-agnostic, scalable personal→enterprise).
- Produce actionable, phased PR plans with verification.
- Align all surfaces (web + extension + native + ChatGPT) through contracts and the Mono system.

### Non-Goals
- Introduce bright colors, gradients, heavy illustration, or deviation from Mono restraint.
- Duplicate logic across clients (server remains source of truth).
- Overhaul in one release — phased, verifiable elevation.
- Generic SaaS patterns (three feature cards, purple heroes, noisy dashboards).

## Proposed Design: Master Structure

### 1. Business Plan, Pricing Evolution & Defensible MOATs

**Positioning (refined, ownable)**  
"Wireline — The operating system for every conversation that matters."  
"One agent. All channels. Handled."

**Segments & Value**
- **Personal**: Busy founder/individual. "Your agent waits on hold and surfaces only what matters."
- **Business (wedge: home services, clinics, legal, property, hospitality)**: "Professional front office that never misses and always follows up."

**Pricing Evolution (build on current)**
- Keep Personal as free-create + Conversation Balance (make Balance the hero experience with beautiful top-up flows, auto-suggestions, transparent ledger).
- Team: Shared coverage for small teams (multi-agent, routing, basic inbox).
- Business: Full operating capacity (CRM sync, roles, analytics, pooled Balance).
- Enterprise: Governed (SSO/SCIM, audit, BYO telephony, committed usage) — add clearer self-serve path to "contact sales" with usage simulator.
- Add visible "Fleet" concept: easy management of multiple agents with shared memory/training where appropriate.

**Conversation Balance Elevation**
- Prominent, delightful funding surface (already has presets).
- Real-time usage + projected runway.
- "Fund from outcome" suggestions after valuable calls.
- Implemented first tranche: 
  - Intelligence sidebar ("Intelligence from outcomes") in Train (KnowledgeWorkspace.tsx) with demo + live-apply suggestions. One-click trains the agent.
  - StudioWorkroom proposals elevated to beautiful full-width action cards.
  - Visible "Recent outcomes (ledger)" section in workroom with tappable briefs that prefill the director input. Ties directly to flywheel.
  - Pricing hero copy updated to highlight the training-from-outcomes moat.
  - New types for TrainingSuggestion + OutcomeRecord.
  - Design check in `npm run verify` passed (Clear System green).

**Defensible MOATs (5 Pillars — productize these)**
1. **Outcome Ledger + Training Flywheel** (data moat): Every conversation produces structured outcomes, summaries, and suggested training updates. Studio surfaces "Intelligence from recent calls" pane that proposes facts/rules/personality tweaks with one-click apply. (Build on existing proposals in StudioWorkroom).
2. **Protected Multi-Surface Runtime** (platform moat): Server owns prompts, policy, billing, execution. Browser Command and native clients are deliberate, user-initiated thin surfaces.
3. **Economic Alignment & Expansion** (economic moat): Balance model makes value obvious and expansion natural. Clear path Personal → Team → Business with usage visibility.
4. **Reliability, Trust & Compliance Surface** (quality moat): First-class recordings, approvals, quality scores, escalation, audit logs. "Every conversation is handled and visible."
5. **Context Integration Depth** (distribution moat): Wireline Command + native widgets/App Intents bring real browser/OS context into agents without harvesting.

**Success Metrics (North Star + Guardrails)**
- Time to first successful live outcome < 5 min.
- % of conversations that produce a usable next step (tracked in ledger).
- Weekly active operators > 80% of seats.
- Post-call training acceptance rate trending up.
- Net retention / expansion via Balance top-ups.

**Business Plan Deliverables**
- Updated pricing page narrative and interactive elements.
- Usage/ledger dashboard in Studio and settings.
- Enterprise readiness checklist (in docs).
- Clear ROI storytelling in marketing.

### 2. Brand Identity & Wireline Mono 2.0 Elevation

**Core Identity**  
"Precision. Calm. Useful. One voice."

**Visual Language (strict elevation, no departure)**
- Canvas, surfaces, text, action, borders, status, feedback: stay within current tokens.
- Elevate: tighter type scale and weights (Hanken Grotesk or refined Inter for display where appropriate, but validate against current pipeline), more purposeful micro-elevation and focus states, refined radius and spacing rhythm.
- Signature motif: subtle "thread" or "loom" line treatments in marketing and empty states (inspired by existing artifacts) — used sparingly.
- Motion: 120-300ms, standard cubic-bezier. Purposeful press (scale 0.985), entrance for cards/outcomes, respect reduced-motion.
- Logo/Mark: Refine WirelineMark for sharpness at all sizes. Provide lockup variants (wordmark + mark) for marketing and app.
- Voice & Tone Guidelines: Short. Warm when human, direct when operating. Never verbose. Specific microcopy. Banned: generic assistant language.

**Governance**
- All new UI must derive from `design-tokens/wireline.tokens.json`.
- New atoms/molecules go through atomic design contracts.
- Cross-surface generation remains mandatory.

### 3. Marketing Operating System

**Positioning Hierarchy**
- Hero: "Agents for every conversation."
- Sub: "Calls, texts, follow-up. Handled. One voice. All channels."
- Proof: Real outcomes, time saved, coverage reliability.

**Key Surfaces**
- Landing (PrecisionLanding): Hero with immediate "Create agent" + proof strip + channel breakdown (Calls/Texts/Email) + one-voice story.
- Pricing: Education-first + tiers + Balance as hero + FAQ that sells the model.
- Features / Solutions / Verticals: Outcome-focused, not feature lists. Use vertical landing patterns already present.
- Compare: Honest, Wireline wins where multi-channel fleet + protected runtime matter.

**Assets & Campaigns**
- Leverage and evolve existing generated concepts (unified fleet, one-voice, precision workbench).
- Consistent "Wireline OS" framing.

### 4. Public Web Surfaces Design

**Principles (apply everywhere)**
- One primary promise + one primary CTA above the fold.
- Generous but purposeful whitespace. Max content width respected.
- Proof and social signals are concrete (not stock).
- Conversion path is frictionless (create → immediate value).

**Key Elevations**
- **Landing**: Stronger first-run demo path or simulated outcome. Better mobile experience.
- **Pricing**: Add live Balance calculator + "See your potential coverage" simulator. Clear "Start free" vs upgrade triggers.
- Responsive and a11y pass against existing visual QA corpus.

### 5. Authenticated Product Web — Studio Core UI/UX (Highest Usefulness Impact)

**Overall Architecture**
- Persistent agent selector + context (name, role, status, quick stats).
- Primary surface = conversation + outcomes.
- Training is always one click from Run (and proactive).
- Wire/Actions for numbers, integrations, routing.

**Critical Flows — World-Class Specification**

**Create (CreateAgentDialog + intake)**
- Short, delightful: Name, Role (presets + custom), Voice preview (play samples), Personality, Brief (with smart examples/prompts).
- On submit: Immediate transition to Training with suggested first sources.
- Business vs Personal posture respected but unified flow.

**Train (KnowledgePage + KnowledgeWorkspace)**
- Current: Excellent nav (Facts, Rules, Sources, Voice, Test call, Memory).
- Elevation: 
  - AI Suggestions sidebar: "From last 12 calls: 4 facts and 2 rules suggested. Review & apply."
  - Source upload + website scrape remains; add "Extract from recent outcomes" button.
  - Test call simulator is prominent and leads directly to "Apply learnings".
  - Versioning or history of training changes.
  - Quality/evaluation scores visible.

**Run / Studio (StudioWorkspaceV2 + StudioWorkroom + StudioOverview)**
- Overview: Clean roster with status, last outcome, quick "Wire" actions. Work prompts prominent.
- Workroom (the heart):
  - Chat remains primary.
  - Split or tabbed: Conversation | Outcomes & Approvals | Proposals.
  - Proposals elevated to beautiful, scannable cards (changes, actions, tool toggles) with Accept/Decline + "Apply all".
  - Outcome ledger view: Timeline of calls/texts/emails with summaries, recordings, next steps. Click to "Train from this".
  - Quick prompts refined and contextual.
  - Multi-channel visibility ("One voice thread").

**Wire / Actions**
- Numbers, integrations, routing, approvals in one calm place.
- Clear "This agent is live on these channels" status.

**States (non-negotiable)**
- Empty, loading skeletons, error (graceful, actionable), success (celebratory but understated), degraded (clear but non-alarming), partial data.

**Components & Tokens**
- Strict use of atoms (Button, Input, etc.), studio-card, wl- classes.
- Dense but breathable (wl-ui-caps patterns).
- Keyboard-first, excellent focus, live regions for chat and proposals.

**Onboarding & First Value**
- Post-create: "Train with these 3 quick sources or run a test call."
- Guided path to first live (or simulated) outcome.

### 6. Cross-Surface Platform

- All surfaces consume the same agent config, training, and execution contracts.
- Browser Command: Explicit context handoff only. Elevated panel polish.
- Native (iOS/Android): Widget, CallKit/Telecom, shortcuts, notification actions — thin clients. Same Mono tokens where applicable.
- ChatGPT App: Private drafting + simulation only until expanded.

## API / Interface Changes

- Strengthen outcome ledger schema and events (for flywheel).
- Add "training suggestions" and "apply training patch" endpoints.
- Enhanced usage/ledger read models for dashboard.
- No breaking changes to existing agent create/train/run contracts.

## Data Model Changes

- Extend conversations/outcomes for structured suggestions.
- Add agent training versions or diff ledger (optional, high value).
- Balance ledger remains source of truth.

## Alternatives Considered

1. **Bigger visual refresh** (new hues, heavier illustration): Rejected — would dilute the Mono strength and current restraint that users and team already respect.
2. **Separate apps per surface**: Rejected — violates client surfaces contract and moat of unified fleet.
3. **Unlimited plans instead of Balance**: Rejected — Balance creates transparency, defensibility, and aligned expansion.

## Security, Privacy, Observability

- All new surfaces and features inherit existing RLS, authz matrix, CSP, rate limits.
- Outcome data is tenant-scoped; suggestions are opt-in/visible.
- Add usage and quality metrics with privacy-respecting aggregation.
- Full verification path (`npm run verify:full`) + new usefulness contract checks.

## Rollout Plan

- Phase 1: Design system + contracts + business surfaces polish.
- Phase 2: Studio flow elevations (Train intelligence first, then Run outcomes).
- Phase 3: Marketing + public surfaces + pricing experience.
- Phase 4: Cross-surface + enterprise features.
- Feature flags for new intelligence surfaces. Staged by plan tier where appropriate.
- Continuous visual QA + dogfood loops (existing evolutionary engine).

## Open Questions

- Exact scope of "autonomous director" integration (from task/artifacts) — high future value.
- Depth of voice cloning / custom voices in public launch.
- Enterprise sales motion timing vs self-serve expansion.

## Key Decisions

- Stay strictly inside Mono visual language.
- Chat + outcomes as the primary operating model (not dashboard-heavy).
- Balance model as core economic and moat primitive.
- Server-owned logic and contracts for all surfaces.
- Training flywheel as the #1 data moat to productize immediately.

## References

- Current: ARCHITECTURE.md, CLIENT_SURFACES.md, LAUNCH_OPERATING_SYSTEM.md, OPERATOR_SUCCESS.md, business-usage-pricing-decision.md, design-tokens/wireline.tokens.json, visual QA artifacts, product-copy.ts.
- Existing tests and verification scripts.
- Generated marketing assets in artifacts/.
- First tranche visuals (reference concepts for Studio workroom outcomes + Training intelligence sidebar): generated images in session folder (see chat context for paths). These guided the clean minimal elevation of proposals to cards and intelligence panel.

## PR Plan (Phased, Independently Valuable)

1. **Contracts & Ledger Foundations** — Outcome types, training suggestion schema, usage read models. (Files: schema, api types, lib/ledger)
2. **Design System Polish & New Atoms** — Refined tokens if needed, stronger focus states, proposal cards, outcome components. Update contracts.
3. **Business Surfaces Elevation** — Pricing rewrite with Balance hero + simulator, settings/usage dashboard, tier comparison components.
4. **Training Intelligence (Flywheel MVP)** — Suggestions pane in KnowledgeWorkspace, "Train from outcome" actions, one-click apply.
5. **Studio Run Elevation** — Workroom outcomes view, enhanced proposals UI, multi-channel thread view. Update StudioWorkroom + StudioOverview.
6. **Create Flow Delight** — Enhanced dialog with previews and smart brief examples. First-value guidance.
7. **Public Marketing Polish** — Landing, pricing, features updates using new components and narratives. OG/asset refresh.
8. **Brand & Guidelines** — Updated mark variants, motion guidelines, voice doc, marketing kit updates.
9. **Cross-Surface Sync** — Extension panel polish, mobile contract updates if needed, consistency pass.
10. **Measurement & Ops** — New metrics, quality scoring UI, verification script expansion.
11. **Enterprise & Scale** — SSO hints, audit surface basics, committed usage views (as needed).
12. **Final Verification & Launch Prep** — Full design contract, visual QA sweep, docs update, dogfood.

Each PR must pass `npm run verify` (and full where relevant), include before/after or screenshots for UI changes, and update relevant contracts/tests.

**Estimated impact**: First 4 PRs deliver visible extreme usefulness and moat visibility. Full set makes Wireline feel inevitable.

---

**This document synthesizes the complete vision.** It is specific, references real files, prioritizes needle-moving work, and provides a clear path to execution while meeting every requirement in the request (clean/minimal/beautiful/functional, extreme usefulness, MOATs, future-proof, world-class).

Next steps available upon your review:
- Revise any section.
- Split into per-area specs.
- Move to detailed writing-plans for PR 1+.
- Generate visual reference images for key screens.
- Launch implementation on the highest priority area.

Please review and confirm direction or request adjustments. This positions Wireline as undeniably successful.