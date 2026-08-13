# Codebase Health

This file is Wireline's durable repository-health contract. It defines what belongs in source control, what must be deleted or ignored, and how canonical policy differs from dated audit evidence.

## Current north star

Wireline is a precise agent operating layer for calls, texts, follow-up, browser context, email, integrations, and optional video presenters. The product model is **Create -> Train -> Wire -> Run**.

- **Create** is short intake: name, role, voice, personality, and starting brief.
- **Training** owns documents, sources, behavior, voice, policies, evaluation, memory, and escalation rules.
- **Wire** owns numbers, integrations, routing, connected tools, approvals, billing, and launch controls.
- **Run / Studio** is chat-first execution for calls, texts, follow-up, approvals, handoff, and review.
- **Video presenter** is an optional business-agent layer. Vendor names stay out of customer-facing copy; the Wireline face remains the fallback.

Historic dashboard, manager, command-center, chat, operations, and temporary Studio paths must redirect into the active product model or be explicitly retired. Dark and light themes must express one Wireline Letterpress system rather than separate products.

## Active product boundary

| Surface | Active source |
| --- | --- |
| Routing | `src/App.tsx`, `src/routes/AppRoutes.tsx` |
| Overview | `src/pages/OverviewPage.tsx` |
| Create | `src/pages/AgentStudioHome.tsx`, `src/components/CreateAgentDialog.tsx` |
| Training | `src/pages/KnowledgePage.tsx`, `src/components/KnowledgeBaseClaude.tsx`, `src/components/training/` |
| Wire | `src/pages/ConnectionsPage.tsx`, `src/pages/SalesforceIntegrationPage.tsx` |
| Run / Studio | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx` |
| Shell | `src/components/WorkspaceShell.tsx`, `src/components/layout/AppShell.tsx` |
| Design | `design-tokens/wireline.tokens.json`, `src/constants/brand-colors.ts`, `src/styles/design-system.css`, `src/lib/wireline-design-vision.ts` |
| Billing | `src/lib/plan-catalog.ts`, `src/lib/conversation-balance.ts`, `docs/business-usage-pricing-decision.md` |
| Voice | `src/lib/ai-models.ts`, `src/lib/voice/`, `docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md` |
| Video presenter | `src/lib/video-presenter/`, `src/components/LiveVideoPresenter.tsx`, `src/routes/video-presenter-routes.ts` |
| Browser extension | `apps/browser-extension/` |
| Native clients | `ios/`, `android/` |
| ChatGPT App | `src/routes/chatgpt-mcp-*`, `src/lib/chatgpt-mcp-*`, `api/mcp.ts`, `docs/CHATGPT_APP.md` |

## Source-control rules

### Must stay out of the repository

- Local agent-session output, generated review summaries, execution plans, screenshots, visual-QA captures, Playwright reports, coverage, build output, browser packages, temporary scripts, patches, and worktree scratchpads.
- Secrets, exported environment mirrors, customer data, transcripts, raw provider payloads, local databases, and personal machine paths.
- Generated marketing kits, official-asset bundles, archive exports, and provider/catalog mirrors.
- One deliberate exception: `public/downloads/wireline-command-{chromium,firefox}.zip` are tracked because `src/pages/BrowserCommandInstallPage.tsx` serves them directly and `tests/browser-extension-download-freshness-contract.test.ts` pins them to their source; regenerate via `node apps/browser-extension/scripts/build.mjs` whenever `apps/browser-extension/` changes.

### Must be deleted when found

- Thin `*-v2` wrappers or one-line re-export files that only bridge a completed migration.
- Duplicate docs whose durable content already exists in `README.md`, `CONTRIBUTING.md`, `CODEBASE_HEALTH.md`, `ARCHITECTURE.md`, or a canonical document.
- Generated design reviews, AI-review files, temporary execution summaries, and branch-local artifacts.
- Retired redirect-only routes after the replacement is stable and no external client depends on the old URL.
- Old palettes, standalone CSS experiments, mesh/nebula primitives, decorative off-palette colors, and unowned visual contracts.

### Preserve unless explicitly audited

- Drizzle migrations, historical security evidence, billing decision records, authorization evidence, public launch runbooks, and product-contract tests.
- Historical docs with audit value when `docs/AUDIT_INDEX.md` explains their role and supersession.

## Design-system discipline

Wireline Letterpress on the Aurora palette is the only active design system.

- Electric violet is action; ink is structure; silver is the restrained wire accent.
- Dark mode uses a cool obsidian canvas. Light mode uses a cool near-white canvas with the same hierarchy and tokens.
- Inter Tight carries display, Inter carries body, and IBM Plex Mono carries labels and metadata.
- Touch targets stay at least 44px. Focus rings stay visible. Accessible names survive visual polish.
- Do not reintroduce the retired forest-green/copper palette, signal blue, dark-only Studio experiments, mesh/nebula primitives, or ad-hoc token aliases.

## Product-language discipline

- Broad public language: `AI voice agents` for personal and business conversations.
- Personal context: `personal agents`.
- Explicit business-role context: `AI employees`, `AI sales agents`, or another specific role when truthful.
- Technical contracts: `agent`.
- Product nouns: `Training`, `Wire`, `Studio`, `calls`, `texts`, `follow-up`, `Runtime Balance`, `included number`, `presenter`, and `live video add-on`.
- Avoid generic `assistant`, `dashboard`, `operator`, `manager`, `control center`, and customer-facing vendor names unless the external API name is the subject.

## Documentation taxonomy

| Document | Role |
| --- | --- |
| `README.md` | Repository entry point, product map, setup, and verification. |
| `CONTRIBUTING.md` | Branch, review, migration, validation, and release workflow. |
| `CODEBASE_HEALTH.md` | Cleanup rules, source-control boundaries, and deletion policy. |
| `ARCHITECTURE.md` | Runtime architecture, data-flow boundaries, and security invariants. |
| `docs/README.md` | Canonical product/system docs, runbooks, and active plans. |
| `docs/AUDIT_INDEX.md` | Dated audit evidence and superseded decision records. |

Every durable Markdown file under `docs/` must be linked from exactly one documentation index. Dated evidence does not become canonical policy by default. Durable conclusions must be promoted into code or the appropriate canonical document.

A Markdown file may remain outside `docs/` only when a tool, source-owning surface, legacy link, or regression contract requires its exact path. Every exception must be linked exactly once from `docs/README.md`, remain a bounded entry point or compatibility pointer, defer full policy to a canonical document, and contain no credentials, environment values, mutable provider inventories, or copied production data.

## Verification

- `npm run check-prod-env` validates required production environment shape.
- `npm run source-control:check` rejects generated/local tracked files, tracked-ignore drift, and case-colliding paths.
- `npm run docs:check` validates required links, link targets, duplicate index membership, and complete `docs/` indexing.
- `npm run verify` runs repository, design, route, docs, OpenAPI, token, Stripe, build, and server-smoke checks.
- `npm run verify:full` adds TypeScript, ESLint, authorization, bootstrap, CSP, runtime-policy, API-error, security-audit, test, and browser-extension gates.
- Vercel exact-head validation and post-deploy runtime-error review remain required for release-impacting changes.

## Audit history

Dated health passes and launch reviews are preserved in `docs/AUDIT_INDEX.md`. This policy file should not grow into a chronological changelog; Git history and the audit index own that evidence.