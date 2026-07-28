# Codebase Health

This file is Wireline's repository-health contract. It defines what belongs in source control, what must be deleted or ignored, which documents are authoritative, and how cleanup is validated.

## Current north star

Wireline is a precise agent operating layer for calls, texts, follow-up, browser context, email, integrations, and optional video presenters. The product model is **Create -> Train -> Wire -> Run**.

- **Create** is short intake: name, role, voice, personality, and starting brief.
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
| Train | `src/pages/KnowledgePage.tsx`, training components |
| Wire | `src/pages/ConnectionsPage.tsx`, integration routes |
| Run / Studio | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx` |
| Shell | `src/components/WorkspaceShell.tsx`, `src/components/layout/AppShell.tsx` |
| Design | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css`, `src/lib/wireline-design-vision.ts` |
| Billing | `src/lib/plan-catalog.ts`, `src/lib/conversation-balance.ts`, billing docs |
| Voice | `src/lib/ai-models.ts`, `src/lib/voice/`, voice policy docs |
| Video presenter | `src/lib/video-presenter/`, `src/components/LiveVideoPresenter.tsx`, presenter routes |
| Browser extension | `apps/browser-extension/` |
| ChatGPT App | ChatGPT MCP routes/tools and `docs/CHATGPT_APP.md` |

## Source-control rules

### Must stay out of the repository

- `.grok/artifacts/`, `.grok/tmp/`, local agent-session output, generated review summaries, generated execution plans, and local design-agent artifacts.
- Visual-QA output, screenshots, Playwright reports, coverage reports, build output, generated browser-extension packages, local patches, reject files, temporary scripts, and worktree scratchpads.
- Secrets, environment mirrors, credential documents, customer data, transcripts, raw provider payloads, local test databases, and personal machine paths.
- Hard-coded founder contact details or live provider rosters in general deployment documentation when code/provider dashboards already own those inventories.

### Must be deleted when found

- Thin `*-v2` wrappers or one-line re-export files that exist only to bridge a completed migration.
- Duplicate docs whose durable content is already represented by a canonical contract.
- Generated design reviews, AI review files, temporary execution summaries, or branch-local artifacts.
- Retired redirect-only routes after the active surface is stable and no external client depends on the old URL.
- Old redesign palettes, standalone CSS experiments, mesh/nebula primitives, decorative off-palette colors, or unowned visual contracts.
- Operational instructions that recommend unsafe database mutation, bypass current tenant isolation, or embed live credentials/PII.

### Preserve unless explicitly audited

- Drizzle migrations, historical security notes, billing decisions, authz evidence, public launch runbooks, and product-contract tests.
- Historical docs with audit value, provided `docs/README.md` classifies them as evidence, historical, or superseded.
- Incident evidence required to explain a durable guardrail, even after the defect is fixed.

## Design-system discipline

Wireline Letterpress on the Aurora palette is the only active design system.

- Electric violet is action.
- Ink is structure.
- A cool near-black obsidian canvas is calm in dark mode; a cool near-white canvas carries the same system in light mode.
- Silver is the wire accent, not a broad decorative palette.
- Inter Tight carries display; Inter carries body; IBM Plex Mono carries labels and metadata.
- Touch targets stay at least 44px. Focus rings stay visible. Accessible names survive visual polish.
- Do not reintroduce the retired forest-green/copper palette, retired primary fonts, signal blue, dark-only Studio experiments, mesh/nebula primitives, or ad-hoc token aliases.

## Product-language discipline

Use customer-facing language consistently:

- Prefer `Agents`, `Training`, `Wire`, `Studio`, `calls`, `texts`, `follow-up`, `Runtime Balance`, `presenter`, `face`, and `live video add-on`.
- Use AI employee language only in explicit business context.
- Avoid reviving generic `assistant`, `dashboard`, `operator`, `manager`, `control center`, or vendor names unless the term is internal code, provider configuration, or an external API name.

## Documentation lifecycle

| Class | Role |
| --- | --- |
| Canonical contract | Defines current repository, runtime, product, security, billing, database, or deployment behavior. |
| Operating runbook | Provides current procedures but must defer to canonical contracts and current provider state. |
| Audit evidence | Preserves point-in-time findings and validation lineage; not standalone current policy. |
| Planned | Describes approved or proposed future work not yet part of the active contract. |
| Historical / superseded | Retained for context; must not drive implementation without revalidation. |
| Generated | Rebuilt by verification tooling and not manually treated as policy. |

Canonical root documents:

| Document | Role |
| --- | --- |
| `README.md` | Entry point, repository map, setup, verification, and hygiene summary. |
| `CODEBASE_HEALTH.md` | Cleanup rules, source-control boundaries, deletion policy, and documentation lifecycle. |
| `ARCHITECTURE.md` | Runtime architecture, data-flow boundaries, provider posture, and security invariants. |
| `DATABASE_SETUP.md` | Safe database operations, `wireline_server` tenant role, migrations, RLS, grants, and verification. |
| `DEPLOY.md` | Vercel project boundary, environment scoping, migration policy, and release evidence. |
| `AGENTS.md` | Cursor/cloud execution context and environment constraints. |
| `CLAUDE.md` | Commands and non-obvious cross-file architecture for coding agents. |
| `docs/README.md` | Complete documentation index and authority/lifecycle map. |

Every Markdown file under `docs/` must be linked exactly once from `docs/README.md`. Dated audit documents are evidence snapshots unless explicitly promoted into a canonical contract.

## Verification

Run the narrowest sufficient check while developing, then the full gate before merge.

- `npm run check-prod-env` — required/recommended production environment shape.
- `npm run docs:check` — required sections, canonical links, complete Markdown indexing, and duplicate-link absence.
- `npm run verify` — design, source-control, route, docs, OpenAPI, token, Stripe, build, and server-smoke checks.
- `npm run verify:full` — all TypeScript configurations, ESLint, full verification, authz, bootstrap, CSP, runtime policy, API error shape, security audit, tests, build, smoke, and browser-extension packaging.
- `npm run verify:contracts` — focused product and source-reading contracts.
- `node apps/browser-extension/scripts/build.mjs --check` — browser-extension packaging and policy checks.
- `GET /api/health` — deployed health probe.
- Review Vercel runtime errors after each production deployment.

## Recent health actions

### 2026-07-27 documentation integrity and operations cleanup

- Replaced contradictory database guidance that recommended `db:push`, Supabase `auth.uid()`, and the wrong tenant role.
- Made `wireline_server` plus `app.current_user_id` the explicit database operations contract.
- Consolidated deployment guidance and removed hard-coded founder contact details and provider-number rosters from repository docs.
- Reorganized `docs/README.md` by authority and lifecycle so canonical policy no longer competes with dated audit evidence.
- Strengthened `docs:check` to require every `docs/**/*.md` file exactly once and reject duplicate links.
- Added a permanent source-reading regression contract for database, deployment, and documentation hygiene.

### 2026-07-10 repository-wide operations cleanup

- Cross-checked GitHub, Stripe, Supabase, and Vercel before changing source.
- Hardened database URL selection and production environment checks against malformed hosts.
- Added regression coverage for pooler selection and production database host rejection.
- Revalidated Supabase RLS and evidence-gated advisor posture.
- Audited authenticated routes and removed stale redirect-only surfaces and unmounted legacy shell components.

### 2026-07-09 launch-readiness pass

- Rewrote launch-readiness records to remove personal filesystem references.
- Deleted stale design-migration planning files and an empty placeholder directory.
- Hardened Vercel secret handling and added `DATABASE_POOL_URL` to examples and checks.
- Added Stripe webhook contract/alignment commands.

### 2026-07-06 level-up guardrails

- Promoted source-control hygiene, route registry, docs index integrity, and design-token parity into normal verification.
- Added whole-product showcase and phased level-up plans.
- Removed the stale browser bearer-token fallback while preserving native Bearer authentication.

### 2026-07-05 Aurora rebrand

- Replaced the retired forest-green/copper palette across source tokens and generated surfaces.
- Made Aurora violet canonical and the old palette forbidden.

### 2026-07-04 repository-health pass

- Added local/generated agent artifacts to `.gitignore`.
- Refreshed root architecture and documentation maps.
- Removed tracked generated review artifacts.

### Prior Letterpress standardization

- Replaced the old design contract with `scripts/check-wireline-clear-system.mjs`.
- Unified tokens, CSS, native/browser assets, icons, legal pages, and manifests.
- Deleted dead Studio and nebula visual primitives.
- Added browser-extension command actions and product-doc contracts.
- Added account deletion controls and guarded mobile-browser settings access.
- Continued splitting oversized modules while preserving audit-value migrations.
