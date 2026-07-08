# Wireline Documentation

Wireline's durable documentation follows the active product model. The customer-facing product loop is **Create -> Train -> Run**; the operational surface adds Wire between Train and Run for numbers, integrations, routing, approvals, billing, and launch controls (**Create -> Train -> Wire -> Run**). This index is the canonical map for repo docs; dated plans and one-off research files are historical unless promoted here.

## Active product surface

| Area | Source | Purpose |
| --- | --- | --- |
| Overview | `src/pages/OverviewPage.tsx` | Calm command center for agents, calls, connections, Conversation Balance, and next actions. |
| Create | `src/pages/AgentStudioHomeClaude.tsx`, `src/components/CreateAgentDialog.tsx` | Short intake for name, role, voice, personality, and starting brief. |
| Train | `src/pages/KnowledgePage.tsx`, `src/components/KnowledgeWorkspace.tsx`, `src/components/AgentAssetUpload.tsx` | Deep configuration for sources, documents, behavior, voice, policies, evaluation, and memory. |
| Wire | `src/pages/ConnectionsPage.tsx`, `src/pages/SalesforceIntegrationPage.tsx` | Numbers, integrations, routing, connected tools, approvals, billing, and launch controls. |
| Run / Studio | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx` | Chat-first execution for calls, texts, follow-up, approvals, handoff, and review. |
| Browser | `apps/browser-extension/` | Wireline Command: explicit page-context handoff into Studio. |
| Native | `ios/`, `android/` | Thin control surfaces for calls, approvals, notifications, widgets, and daily review. |
| ChatGPT App | `docs/CHATGPT_APP.md` | OAuth-connected MCP surface for account-bound private actions. |
| Video presenters | `src/lib/video-presenter/`, `src/components/LiveVideoPresenter.tsx` | Optional live visual presenter add-on for business agents with Wireline-owned customer copy. |

## Current product rules

- Public pages explain. Authenticated pages execute.
- Create stays short; Training owns detailed setup.
- Wire owns numbers, integrations, routing, connected tools, approvals, billing, and live launch controls.
- Studio is the workroom; Overview is the calm command center.
- Avoid authenticated page descriptions unless the user is reviewing history, coaching, analytics, exports, or past actions.
- Use labels, tabs, icons, state, and clear next actions instead of prose paragraphs.
- Phone / Call History and Analytics may explain history, coaching, exports, and insights.
- User-facing language is `Agents`, `Training`, `Wire`, `Studio`, `calls`, `texts`, `follow-up`, `Conversation Balance`, `presenter`, and `live video add-on`.
- Customer-facing video-presenter surfaces must not mention vendor names such as HeyGen or LiveAvatar.
- Wireline Command is the browser surface name; do not restore retired extension names.
- The design system is Wireline Letterpress / Wireline Clear System, on the Aurora palette. Product chrome uses electric-violet action, a cool obsidian (dark) or cool near-white (light) canvas, ink text, a platinum-silver wire accent, and restrained status colors.

## Canonical system references

| Document | Purpose |
| --- | --- |
| [README.md](../README.md) | Repo entry point, source map, setup, verification, and hygiene contract. |
| [CODEBASE_HEALTH.md](../CODEBASE_HEALTH.md) | Cleanup policy, deletion rules, source-control boundaries, and health standards. |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Runtime architecture, route/data boundaries, provider posture, and security invariants. |
| [REPO_HEALTH_AUDIT_2026-07-04.md](./REPO_HEALTH_AUDIT_2026-07-04.md) | Current codebase/repo health-pass findings, actions, and next priorities. |
| [EXCLUDED_SURFACES_AUDIT_2026-07-06.md](./EXCLUDED_SURFACES_AUDIT_2026-07-06.md) | **Active** — source-of-truth triage for excluded/unmounted surfaces and their rebuild/delete targets. |
| [PRODUCT_SHOWCASE_MATRIX.md](./PRODUCT_SHOWCASE_MATRIX.md) | **Active** — whole-product showcase matrix across web, API, native, browser, ChatGPT, voice, video, integrations, trust, and margin. |
| [WIRELINE_LEVEL_UP_MASTER_PLAN.md](./WIRELINE_LEVEL_UP_MASTER_PLAN.md) | **Active** — phased execution plan for truth/deletion, wedge launch, reliability/margin, multi-surface excellence, and expansion. |
| [TRUST_CONVERSION_PACK.md](./TRUST_CONVERSION_PACK.md) | **Active** — customer-facing trust, compliance, and proof posture without overclaiming. |
| [LAUNCH_READINESS_AND_MARGIN.md](./LAUNCH_READINESS_AND_MARGIN.md) | **Active** — launch readiness scorecard and margin operating plan. |
| [TAKEOVER_AUDIT_2026-07-05.md](./TAKEOVER_AUDIT_2026-07-05.md) | **Active** — takeover pass: design system beautification, polish layer, contracts, and verified upgrades. |
| [COMPOSER_CERTIFICATION_2026-07-05.md](./COMPOSER_CERTIFICATION_2026-07-05.md) | **Active** — Composer 2.5 certification ladder, dual-voice PSTN, funnel events, and ops proof. |
| [SUPABASE_ADVISOR_POSTURE_2026-07-07.md](./SUPABASE_ADVISOR_POSTURE_2026-07-07.md) | **Active** - Supabase security/performance advisor posture, custom-auth HIBP control, and unused-index evidence gate. |
| [DEMO_DATA_RESET_QA_CHECKLIST_2026-07-07.md](./DEMO_DATA_RESET_QA_CHECKLIST_2026-07-07.md) | **Active** - dry-run-first demo tenant reset, reseed, and screenshot QA procedure. |
| [OPS_CREDENTIALS_CHECKLIST_2026-07-07.md](./OPS_CREDENTIALS_CHECKLIST_2026-07-07.md) | **Active** — DNC, Redis, Sentry, and scale-readiness env vars. |
| [MULTI_SURFACE_QA_2026-07-07.md](./MULTI_SURFACE_QA_2026-07-07.md) | **Active** — extension, native, and ChatGPT MCP QA rituals. |
| [STRICT_BUSINESS_DESIGN_REVIEW_2026-07-07.md](./STRICT_BUSINESS_DESIGN_REVIEW_2026-07-07.md) | **Active** — strict branch review for design, UI/UX, branding, pricing, marketing, SEO, AI runtime, integrations, and business structure. |
| [REFERRAL_LOOP_SPEC_2026-07-07.md](./REFERRAL_LOOP_SPEC_2026-07-07.md) | **Planned** — Conversation Balance referral loop (post-Horizon 0). |
| [AURORA_MASTERPLAN.md](./AURORA_MASTERPLAN.md) | **Active** — brand voice, marketing/GTM, onboarding, pricing, voice/avatar product, and ops execution plan tied to the Aurora rebrand. |
| [CLIENT_SURFACES.md](./CLIENT_SURFACES.md) | Repository boundaries across web, browser, native, and ChatGPT surfaces. |
| [CHATGPT_APP.md](./CHATGPT_APP.md) | ChatGPT App contract and release verification. |
| [business-usage-pricing-decision.md](./business-usage-pricing-decision.md) | Billing model, Stripe catalog direction, and Conversation Balance posture. |
| [GROK_LIVE_VOICE.md](./GROK_LIVE_VOICE.md) | xAI realtime voice path, safety posture, and live test constraints. |
| [OPERATOR_SUCCESS.md](./OPERATOR_SUCCESS.md) | Operational success motion and support posture. |
| [RESEARCH_OPERATING_SYSTEM.md](./RESEARCH_OPERATING_SYSTEM.md) | Research lanes, prioritization, metrics, and 30/90/180-day execution roadmap. |
| [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md) | **Active** — 2026 product audit, competitive positioning, Letterpress UX, onboarding, KPIs, and implementation checklist. |
| [PRESENTER_VENDOR_STRATEGY.md](./PRESENTER_VENDOR_STRATEGY.md) | Live avatar vendors, custom face clone tiers, provider matrix, and Business presence roadmap. |
| [INTEGRATION_VENDOR_AUDIT.md](./INTEGRATION_VENDOR_AUDIT.md) | Runtime/vendor decisions, deepen-before-expand priorities, and connector corrections. |
| [VENDOR_LAUNCH_MAP.md](./VENDOR_LAUNCH_MAP.md) | **Active** — launch-ready vendor/surface inventory (live, beta, planned, retire) and Stripe legacy cleanup gate. |
| [AUTHZ_MATRIX.md](./AUTHZ_MATRIX.md) | Authorization coverage artifact generated by authz verification. |

## Historical / planning material

| Location | Status |
| --- | --- |
| `docs/superpowers/specs/**` | Historical design/spec plans. Promote durable decisions into canonical docs before using as active truth. |
| `docs/superpowers/plans/**` | Historical execution plans. Useful for context, not the current source of truth. |
| `docs/mobile-web-native-strategy-audit.md` | Strategic context for mobile/browser/native split; verify against current `CLIENT_SURFACES.md` before implementation. |
| `docs/ONE-AGENT-STRATEGY.md` | Strategic framing; keep aligned with Create -> Train -> Wire -> Run and current pricing docs. |

## Documentation hygiene rules

- Every new durable Markdown document must be linked here.
- Dated or exploratory Markdown must state whether it is active, historical, superseded, or archived.
- Generated local review artifacts, `.grok/artifacts`, visual QA output, screenshots, branch execution summaries, and temporary AI-agent files do not belong in source control.
- Durable product copy belongs in source modules or canonical docs, not scattered across one-off plans.
- When a historical doc contains a decision that is still true, promote the decision into `README.md`, `CODEBASE_HEALTH.md`, `ARCHITECTURE.md`, or the relevant canonical doc.

## Verification

- `npm run verify:contracts` - focused product voice, authenticated page map, authenticated copy discipline, marketing metadata, static metadata, and event taxonomy contracts.
- `npm run verify` - design check, source-control hygiene, route registry, docs index, design-token parity, Stripe catalog contract, build, and bundled-server smoke.
- `npm run verify:full` - lint, server lint, design/source-control/route/docs/token/authz/CSP checks, tests, build, and smoke.
- `npm run test:e2e` - Playwright homepage story, accessibility, and audience-tab smoke.
- `node apps/browser-extension/scripts/build.mjs --check` - browser extension contract and packaging smoke.
- `GET /api/health` - deployment health probe.
