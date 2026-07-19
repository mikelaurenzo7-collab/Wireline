# Codebase Health

This file is Wireline's repo-health contract. It defines what belongs in source control, what must be deleted or ignored, and which documents are canonical.

## Current north star

Wireline is a dark, precise agent operating layer for calls, texts, follow-up, browser context, email, integrations, and optional video presenters. The product model is **Create -> Train -> Wire -> Run**.

- **Create** is short intake only: name, role, voice, personality, and starting brief.
- **Train** owns deep configuration: documents, sources, behavior, voice, policies, evaluation, memory, and escalation rules.
- **Wire** owns numbers, integrations, routing, connected tools, approvals, billing, and launch controls.
- **Run / Studio** is chat-first execution for calls, texts, follow-up, approvals, handoff, and review.
- **Video presenter** is an optional business-agent visual layer. Vendor names stay out of customer-facing copy; the Wireline face remains the fallback.

Historic dashboard, manager, command-center, chat, operations, and temporary Studio paths must redirect into the active product model or be explicitly retired.

## Active product boundary

| Surface | Active source |
| --- | --- |
| Routing | `src/App.tsx`, `src/routes/AppRoutes.tsx` |
| Overview | `src/pages/OverviewPage.tsx` |
| Create | `src/pages/AgentStudioHome.tsx`, `src/components/CreateAgentDialog.tsx` |
| Train | `src/pages/KnowledgePage.tsx`, `src/components/KnowledgeBaseClaude.tsx`, `src/components/training/ReportingPreferences.tsx`, `src/components/training/RecentCallArtifactRequests.tsx` |
| Wire | `src/pages/ConnectionsPage.tsx`, `src/pages/SalesforceIntegrationPage.tsx` |
| Run / Studio | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx` |
| Shell | `src/components/WorkspaceShell.tsx`, `src/components/layout/AppShell.tsx` |
| Design | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css`, `src/lib/wireline-design-vision.ts` |
| Billing | `src/lib/plan-catalog.ts`, `src/lib/conversation-balance.ts`, `docs/business-usage-pricing-decision.md` |
| Voice | `src/lib/ai-models.ts`, `src/lib/voice/`, `docs/GROK_LIVE_VOICE.md` |
| Video presenter | `src/lib/video-presenter/`, `src/components/LiveVideoPresenter.tsx`, `src/routes/video-presenter-routes.ts` |
| Browser extension | `apps/browser-extension/` |
| ChatGPT App | `docs/CHATGPT_APP.md`, ChatGPT MCP route/tool code |

## Source-control rules

### Must stay out of the repo

- `.grok/artifacts/`, `.grok/tmp/`, local agent-session output, generated review summaries, generated execution plans, and local design-agent artifacts.
- Visual QA output, screenshots, Playwright reports, coverage reports, build output, generated browser-extension packages, local patches, reject files, temporary scripts, and worktree scratchpads.
- Secrets, exported environment mirrors, customer data, transcripts, raw provider payloads, local test databases, and personal machine paths.

### Must be deleted when found

- Thin `*-v2` wrappers or one-line re-export files that exist only to bridge a migration.
- Duplicate docs whose durable content is already represented by `README.md`, `CODEBASE_HEALTH.md`, `ARCHITECTURE.md`, or `docs/README.md`.
- Generated design reviews, AI review files, temporary execution summaries, or branch-local artifacts.
- Retired redirect-only routes after the new active surface is stable and no external client depends on the old URL.
- Old redesign palettes, standalone CSS experiments, mesh/nebula primitives, decorative off-palette colors, or unowned visual contracts.

### Preserve unless explicitly audited

- Drizzle migrations, historical security notes, billing decisions, authz evidence, public launch runbooks, and product-contract tests.
- Historical docs with audit value, as long as `docs/README.md` marks them historical or links them under the correct section.

## Design-system discipline

Wireline Letterpress — Aurora palette — is the only active design system.

- Electric violet is action.
- Ink is structure.
- A cool, near-black obsidian canvas is calm in dark mode; a cool near-white canvas carries the same story in light mode.
- Silver is the wire accent, not a broad decorative palette.
- Instrument Serif carries big ideas; DM Sans carries work; Space Mono carries labels.
- Touch targets stay at least 44px. Focus rings stay visible. Accessible names must survive visual polish.
- Do not reintroduce the retired forest-green/copper Letterpress palette, signal blue, dark Studio experiments, mesh/nebula primitives, or ad-hoc token aliases.

## Product-language discipline

Use customer-facing language consistently:

- Prefer: `Agents`, `Training`, `Wire`, `Studio`, `calls`, `texts`, `follow-up`, `Conversation Balance`, `presenter`, `face`, `live video add-on`.
- Avoid reviving generic `assistant`, `dashboard`, `operator`, `manager`, `control center`, or vendor names unless the term is internal code, provider configuration, or an external API name.

## Documentation taxonomy

| Document | Role |
| --- | --- |
| `README.md` | Entry point, repo map, verification commands, hygiene contract. |
| `CODEBASE_HEALTH.md` | Cleanup rules, source-control boundaries, deletion policy. |
| `ARCHITECTURE.md` | Runtime architecture, data-flow boundaries, security invariants. |
| `docs/README.md` | Documentation index and canonical/historical status map. |
| `docs/REPO_HEALTH_AUDIT_2026-07-04.md` | Current health-pass audit, actions, and next priorities. |
| `docs/EXCLUDED_SURFACES_AUDIT_2026-07-06.md` | Active rebuild/delete triage for excluded and unmounted product surfaces. |
| `docs/PRODUCT_SHOWCASE_MATRIX.md` | Active whole-product showcase matrix and feature-status discipline. |
| `docs/WIRELINE_LEVEL_UP_MASTER_PLAN.md` | Active phased level-up plan for repo, product, trust, cost, and surfaces. |
| `docs/TRUST_CONVERSION_PACK.md` | Active customer trust, compliance, and proof posture. |
| `docs/LAUNCH_READINESS_AND_MARGIN.md` | Active launch readiness and account-level margin cockpit plan. |
| `docs/business-usage-pricing-decision.md` | Billing catalog and Stripe product model. |
| `docs/CLIENT_SURFACES.md` | Web, browser, native, and ChatGPT ownership boundaries. |
| `docs/CHATGPT_APP.md` | ChatGPT App contract and release verification. |
| `docs/superpowers/**` | Historical planning/spec artifacts only unless promoted into canonical docs. |

## Verification

Run the narrowest sufficient check while developing, then the full gate before merge.

- `npm run check-prod-env` — required/recommended production environment shape, including deploy-safe Postgres URL host validation.
- `npm run verify` — design check, source-control hygiene, route registry, docs index, OpenAPI, design-token parity, Stripe catalog contract, production build, and bundled-server import smoke.
- `npm run verify:full` — type check, server lint, design/source-control/route/docs/openapi/token checks, Stripe catalog contract, authz, bootstrap, tsconfig-exclude hygiene, CSP, runtime policy, API error shape, `npm audit`, tests, build, smoke, and the browser-extension packaging check.
- `npm run verify:contracts` — product voice, metadata, event taxonomy, and static contracts.
- `node apps/browser-extension/scripts/build.mjs --check` — browser extension packaging and policy checks.
- `GET /api/health` — deployed health probe.
- Review Vercel runtime errors after each deployment.

## Recent health actions

### 2026-07-10 repo-wide ops cleanup

- Cross-checked GitHub, Stripe, Supabase, and Vercel before changing source.
- Hardened database URL selection and production env checks against single-label database hosts such as `base`, which Vercel runtime logs had surfaced as `getaddrinfo ENOTFOUND base` during a signup attempt.
- Added regression coverage for valid pooler selection, malformed pooler fallback, and invalid production database host rejection.
- Refreshed README verification guidance so environment shape checks are explicit before deploy.
- Revalidated Supabase: project `ogenlhodmwvyacvnrsnj` is active healthy; RLS is enabled on listed app tables; the remaining security advisor is Supabase Auth leaked-password protection, which is not the active custom-auth control; unused-index lints remain evidence-gated, not automatic deletion targets.
- Revalidated Stripe: the active catalog includes Personal, Team, Business, Enterprise, Conversation Balance, and Live Video products; zero-dollar `Retired catalog anchor` prices are not referenced by source and remain an ops cleanup candidate before broad public checkout.
- Revalidated Vercel: latest `wireline` production deployment is READY; runtime errors were clear over the last 30 minutes at the time of this pass.

- Audited authenticated route and chrome surfaces; removed stale redirect-only client routes for pulse/fleet/ops/training/chat/actions/nexus/wires and deleted unmounted legacy shell components while preserving only defensive `/agents`, `/call-logs`, and `/logs` redirects.

### 2026-07-09 launch-readiness pass

- Rewrote `docs/PERFECTION_PLAN.md` as a self-contained launch-readiness record (it previously pointed at a personal `Downloads` pack) and linked it from `docs/README.md`.
- Deleted stale `references/` design-migration planning files (kept `design-system-navigation-plan.md`, which a contract test reads) and the empty `.stitch/` placeholder.
- Hardened Vercel secret handling: sync scripts write `encrypted` (never `plain`), secret reads go through `scripts/lib/vercel-env-values.mjs` per-variable decryption, and `DATABASE_POOL_URL` joined the env examples and checks.
- Added `npm run stripe:webhook:check` / `stripe:webhook:align` so the production Stripe webhook's `enabled_events` cannot drift from the handlers in `src/routes/billing-routes.ts`.

### 2026-07-06 level-up guardrails

- Promoted source-control hygiene, route registry invariants, docs index integrity, and design-token parity into the normal verification path.
- Added `docs/PRODUCT_SHOWCASE_MATRIX.md` so all Wireline features are showcased while retaining live/beta/planned/historical status discipline.
- Added `docs/WIRELINE_LEVEL_UP_MASTER_PLAN.md` as the phased execution plan for truth/deletion, wedge launch, reliability/margin, multi-surface excellence, and expansion.
- Removed the stale browser `wireline_token` bearer fallback so web auth stays httpOnly-cookie based while native remains explicit Bearer auth.

### 2026-07-05 Aurora rebrand

- Replaced the Letterpress forest-green/copper palette with the Aurora violet/silver/obsidian palette across `design-tokens/wireline.tokens.json` and every generated surface (web, browser extension, iOS, Android), the optional light theme, static legal pages, the ChatGPT MCP widget, app/OS icon marks, the OG share image, and the design contract + tests that pin exact hex values.
- Flipped the design-vision "no purple" rule: Aurora violet is now canon, and the retired forest-green/copper palette is what must not return.

### 2026-07-04 repo-health pass

- Added `.grok/artifacts/` and `.grok/tmp/` to `.gitignore`.
- Refreshed `README.md`, `CODEBASE_HEALTH.md`, `ARCHITECTURE.md`, and `docs/README.md` around the active Create -> Train -> Wire -> Run model.
- Added `docs/REPO_HEALTH_AUDIT_2026-07-04.md` as the current source of truth for this health pass.
- Removed tracked Grok/generated review artifacts discovered in `.grok/artifacts/`.
- Marked generated/local AI artifacts as non-durable source-control material.

### Prior Wireline Letterpress standardization

- Replaced the old design contract with `scripts/check-wireline-clear-system.mjs`.
- Moved source tokens, generated CSS, generated TypeScript, browser extension tokens, native Android tokens, iOS tokens, icons, legal pages, and app manifests to Wireline Letterpress.
- Deleted dead Studio right-rail and nebula visual primitives.
- Deleted stale standalone redesign landing artifacts that preserved the wrong dark/blue palette.
- Added Wireline Command browser-extension command actions and product-doc contracts.
- Added account deletion controls and guarded mobile-browser settings access.
- Continued aggressive split plan for large monolithic files while preserving audit-value migrations.
