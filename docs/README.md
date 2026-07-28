# Wireline Documentation

This index is the authority map for Wireline documentation. It distinguishes durable contracts from operational runbooks, point-in-time audit evidence, planned work, and historical material.

The customer-facing product loop is **Create -> Train -> Run**. Operationally, Wire sits between Train and Run for numbers, integrations, routing, approvals, billing, and launch controls: **Create -> Train -> Wire -> Run**.

Broad public copy uses **AI voice agents** for personal and business conversations. Personal workspaces create personal agents. Business workspaces may create AI employees when the business context is explicit. Technical contracts retain `agent`.

## Active product surface

| Area | Source | Purpose |
| --- | --- | --- |
| Overview | `src/pages/OverviewPage.tsx` | Calm command center for agents, calls, connections, Runtime Balance, and next actions. |
| Create | `src/pages/AgentStudioHome.tsx`, `src/components/CreateAgentDialog.tsx` | Short intake for name, role, voice, personality, and starting brief. |
| Train | `src/pages/KnowledgePage.tsx`, training components | Durable facts, sources, behavior, voice, policy, evaluation, and memory. |
| Wire | `src/pages/ConnectionsPage.tsx`, integration routes | Numbers, integrations, routing, approvals, billing, and launch controls. |
| Run / Studio | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx` | Chat-first execution for calls, texts, follow-up, approvals, handoff, and review. |
| Browser | `apps/browser-extension/` | Wireline Command: explicit page-context handoff into Studio. |
| Native | `ios/`, `android/` | Thin owner-control surfaces for calls, approvals, notifications, widgets, and review. |
| ChatGPT App | ChatGPT MCP routes and tools | OAuth-connected account-bound private actions. |
| Video presenters | `src/lib/video-presenter/` | Optional, consent-gated business-agent visual layer. |

## Current product rules

- Public pages explain; authenticated pages execute.
- Create stays short; Training owns detailed setup.
- Wire owns numbers, integrations, routing, approvals, billing, and launch controls.
- Every included agent should include one included number before extra line capacity is sold.
- Studio is the workroom; Overview is the command center.
- Outbound, inbound, and hybrid are first-class modes.
- Specific outbound business roles may be described as AI sales agents when the role is explicit.
- Use `CUSTOMER_TERMINOLOGY.md` for customer-facing naming.
- Customer-facing presenter surfaces do not expose vendor names.
- Wireline Command remains explicit-user-action only.
- Wireline Letterpress on the Aurora palette is the only active design system.

## Canonical contracts

These documents define current behavior or repository rules. When a dated audit conflicts with this section, the canonical contract wins.

| Document | Authority |
| --- | --- |
| [README.md](../README.md) | Repository entry point, source map, setup, and verification. |
| [CODEBASE_HEALTH.md](../CODEBASE_HEALTH.md) | Cleanup policy, deletion rules, and source-control boundaries. |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Runtime architecture, provider posture, and security invariants. |
| [DATABASE_SETUP.md](../DATABASE_SETUP.md) | Safe database operations, tenant role, migrations, RLS, grants, and verification. |
| [DEPLOY.md](../DEPLOY.md) | Vercel production boundary, environment scoping, migrations, and release evidence. |
| [AGENTS.md](../AGENTS.md) | Cursor/cloud execution context and non-obvious environment constraints. |
| [CLAUDE.md](../CLAUDE.md) | Repository commands and cross-file architecture guidance for coding agents. |
| [CUSTOMER_TERMINOLOGY.md](./CUSTOMER_TERMINOLOGY.md) | Personal-agent, business-context AI-employee, and technical-agent language contract. |
| [ONE-AGENT-STRATEGY.md](./ONE-AGENT-STRATEGY.md) | Agent-first positioning and roster-friendly product framing. |
| [CLIENT_SURFACES.md](./CLIENT_SURFACES.md) | Web, browser, native, and ChatGPT ownership boundaries. |
| [CHATGPT_APP.md](./CHATGPT_APP.md) | ChatGPT App product and release contract. |
| [AGENT_CUSTOMIZATION_ARCHITECTURE.md](./AGENT_CUSTOMIZATION_ARCHITECTURE.md) | Agent customization client/domain boundary. |
| [PRODUCT_SHOWCASE_MATRIX.md](./PRODUCT_SHOWCASE_MATRIX.md) | Whole-product surface and release-status matrix. |
| [WIRELINE_LEVEL_UP_MASTER_PLAN.md](./WIRELINE_LEVEL_UP_MASTER_PLAN.md) | Phased product, reliability, cost, and surface execution plan. |
| [TRUST_CONVERSION_PACK.md](./TRUST_CONVERSION_PACK.md) | Customer-facing trust, compliance, and proof posture. |
| [LAUNCH_READINESS_AND_MARGIN.md](./LAUNCH_READINESS_AND_MARGIN.md) | Launch and account-level margin operating framework. |
| [business-usage-pricing-decision.md](./business-usage-pricing-decision.md) | Billing model and Runtime Balance posture. |
| [BILLING_RUNBOOK.md](./BILLING_RUNBOOK.md) | Checkout, entitlement, Runtime Balance, webhook, cancellation, and reconciliation proof. |
| [P0_BILLING_OPS_NOTE.md](./P0_BILLING_OPS_NOTE.md) | Founder catalog v6 lock and live billing-proof checklist. |
| [GROK_LIVE_VOICE.md](./GROK_LIVE_VOICE.md) | Current customer-facing realtime boundary and retired xAI demo posture. |
| [PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md](./PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md) | Production PSTN, OpenAI Realtime, presenter, and marketing-voice boundary. |
| [VERIFIED_VOICE_MOAT_AND_PARTNER_STRATEGY.md](./VERIFIED_VOICE_MOAT_AND_PARTNER_STRATEGY.md) | Provider-neutral voice moat and partner sequence. |
| [COMPANY_IDENTITY_PACK.md](./COMPANY_IDENTITY_PACK.md) | Number, calling, SMS, and email identity boundaries. |
| [RECAP_AND_PROPOSAL_ARTIFACTS.md](./RECAP_AND_PROPOSAL_ARTIFACTS.md) | Shareable recap/proposal artifact contract. |
| [ACCESSIBILITY.md](./ACCESSIBILITY.md) | Accessibility commitment. |
| [accessibility-e2e-gate.md](./accessibility-e2e-gate.md) | Critical-route accessibility gate policy. |
| [design-system-responsive-roadmap.md](./design-system-responsive-roadmap.md) | Responsive layout and component-containment rules. |
| [CHATGPT_APP_DASHBOARD_CONFIG.md](./CHATGPT_APP_DASHBOARD_CONFIG.md) | ChatGPT App dashboard and OAuth registration record. |
| [CHATGPT_APP_SUBMISSION.md](./CHATGPT_APP_SUBMISSION.md) | ChatGPT App submission contract. |
| [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) | Incident response runbook. |
| [SLA.md](./SLA.md) | Service-level commitments. |
| [LOAD_TEST.md](./LOAD_TEST.md) | Voice-webhook load-test methodology. |
| [security/auth-password-controls.md](./security/auth-password-controls.md) | Wireline-owned password hashing and HIBP screening posture. |
| [AUTHZ_MATRIX.md](./AUTHZ_MATRIX.md) | Generated authorization coverage artifact. |

## Operating runbooks and current decisions

These documents are actively useful but narrower than the canonical contracts. Their dated operational facts must be reverified before execution.

| Document | Use |
| --- | --- |
| [FOUNDER_LAUNCH_COMMAND_CENTER.md](./FOUNDER_LAUNCH_COMMAND_CENTER.md) | Owner go/no-go, GTM, KPI, support, and rollback control center. |
| [LAUNCH_GURU_PLAYBOOK_2026-07-20.md](./LAUNCH_GURU_PLAYBOOK_2026-07-20.md) | Launch sequence, GTM, KPIs, and quality gates. |
| [LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md](./LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md) | Creative doctrine and production prompts. |
| [WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md](./WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md) | Current campaign copy, claims, UTMs, scripts, and activation QA. |
| [GUIDED_AGENT_SETUP_2026-07-08.md](./GUIDED_AGENT_SETUP_2026-07-08.md) | Guided call-plan setup method. |
| [PRICING_DECISION_2026-07-25.md](./PRICING_DECISION_2026-07-25.md) | Founder catalog v6 decision and margin floors. |
| [PLAN_CAPACITY_HEADROOM_2026-07-25.md](./PLAN_CAPACITY_HEADROOM_2026-07-25.md) | Capacity arithmetic method; v5 conclusions are superseded by the v6 pricing decision. |
| [SUPABASE_ADVISOR_POSTURE_2026-07-07.md](./SUPABASE_ADVISOR_POSTURE_2026-07-07.md) | Advisor interpretation for custom auth and evidence-gated index cleanup. |
| [DEMO_DATA_RESET_QA_CHECKLIST_2026-07-07.md](./DEMO_DATA_RESET_QA_CHECKLIST_2026-07-07.md) | Dry-run-first demo reset and screenshot QA. |
| [OPS_CREDENTIALS_CHECKLIST_2026-07-07.md](./OPS_CREDENTIALS_CHECKLIST_2026-07-07.md) | DNC, Redis, Sentry, and scale-readiness environment checklist. |
| [MULTI_SURFACE_QA_2026-07-07.md](./MULTI_SURFACE_QA_2026-07-07.md) | Browser, native, and ChatGPT QA rituals. |
| [AURORA_MASTERPLAN.md](./AURORA_MASTERPLAN.md) | Supporting Aurora brand and product context; exact tokens live in code. |
| [CLIENT_SURFACES_STRATEGY_2026-07-20.md](./CLIENT_SURFACES_STRATEGY_2026-07-20.md) | Keep/shrink decisions for extension, MCP, and native surfaces. |
| [OPERATOR_SUCCESS.md](./OPERATOR_SUCCESS.md) | Operator success and support motion. |
| [RESEARCH_OPERATING_SYSTEM.md](./RESEARCH_OPERATING_SYSTEM.md) | Research lanes, prioritization, and roadmap. |
| [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md) | 2026 product, positioning, UX, KPI, and implementation roadmap. |
| [PRESENTER_VENDOR_STRATEGY.md](./PRESENTER_VENDOR_STRATEGY.md) | Presenter vendor matrix and rollout strategy. |
| [VENDOR_LAUNCH_MAP.md](./VENDOR_LAUNCH_MAP.md) | Vendor/surface launch inventory and status. |
| [WIRELINE_CEO_LAUNCH_CHECKLIST_2026-07-10.md](./WIRELINE_CEO_LAUNCH_CHECKLIST_2026-07-10.md) | Founder launch checklist; verify pricing and provider facts against current contracts. |
| [RUNNING_COSTS_AUDIT_2026-07-06.md](./RUNNING_COSTS_AUDIT_2026-07-06.md) | Cost evidence used by the margin framework. |
| [HARNESS_WINGMAN.md](./HARNESS_WINGMAN.md) | Infrastructure harness doctrine. |

## Audit evidence and historical snapshots

These files preserve the reasoning, validation, and defects found in point-in-time passes. They are evidence, not standalone current policy. Use them to understand lineage, then verify against canonical source and current production state.

| Document | Evidence scope |
| --- | --- |
| [EXCLUDED_SURFACES_AUDIT_2026-07-06.md](./EXCLUDED_SURFACES_AUDIT_2026-07-06.md) | Excluded/unmounted surface triage and rebuild/delete evidence. |
| [LAUNCH_PERFECTION_PASS_2026-07-19.md](./LAUNCH_PERFECTION_PASS_2026-07-19.md) | Provider/runtime launch verification snapshot. |
| [LAUNCH_READINESS_FINETUNE_2026-07-19.md](./LAUNCH_READINESS_FINETUNE_2026-07-19.md) | Security, RLS, timing, and route cleanup evidence. |
| [E2E_AUDIT_STRIPE_VERCEL_2026-07-20.md](./E2E_AUDIT_STRIPE_VERCEL_2026-07-20.md) | Stripe/Vercel audit snapshot; legacy brand references are historical. |
| [E2E_LAUNCH_HARDENING_2026-07-20.md](./E2E_LAUNCH_HARDENING_2026-07-20.md) | Activation, rate-limit, DNC, grants, and launch-blocker evidence. |
| [DEEP_AUDIT_WINS_2026-07-22.md](./DEEP_AUDIT_WINS_2026-07-22.md) | Outbound gate, observability, fallback, CSP, and vendor evidence. |
| [INDUSTRY_LEADER_AUDIT_2026-07-22.md](./INDUSTRY_LEADER_AUDIT_2026-07-22.md) | Token safety, Twilio, spend, CRM, and catalog evidence. |
| [FULL_STACK_AUDIT_VISUAL_QA_2026-07-22.md](./FULL_STACK_AUDIT_VISUAL_QA_2026-07-22.md) | Full-stack and visual-QA evidence. |
| [VISUAL_QA_WINS_2026-07-22.md](./VISUAL_QA_WINS_2026-07-22.md) | Authenticated visual-QA findings. |
| [LAUNCH_FINAL_QA_2026-07-22.md](./LAUNCH_FINAL_QA_2026-07-22.md) | Deployment, hero, DNC, pricing, and CI-flake evidence. |
| [FIERCE_AUDIT_LEVEL_UP_2026-07-22.md](./FIERCE_AUDIT_LEVEL_UP_2026-07-22.md) | Checkout, TCPA, CRM, model, MMS, and sales evidence. |
| [LAUNCH_READINESS_AUDIT_2026-07-25.md](./LAUNCH_READINESS_AUDIT_2026-07-25.md) | Activation, quotas, client honesty, dial gate, and billing evidence. |
| [OPERATOR_BRIEF_2026-07-25.md](./OPERATOR_BRIEF_2026-07-25.md) | Digest of July 25 shipped work and then-open items. |
| [LAUNCH_READINESS_AUDIT_2026-07-26.md](./LAUNCH_READINESS_AUDIT_2026-07-26.md) | RLS, purge, SMS, DNC, deletion, race, and authz evidence. |
| [LAUNCH_READINESS_FINETUNE_2026-07-27.md](./LAUNCH_READINESS_FINETUNE_2026-07-27.md) | July 27 multi-pass implementation evidence. |

## Planned work

| Document | Status |
| --- | --- |
| [REFERRAL_LOOP_SPEC_2026-07-07.md](./REFERRAL_LOOP_SPEC_2026-07-07.md) | Planned Conversation Balance referral loop. |
| [DESIGN_PARTNER_SPRINT_2026-07-08.md](./DESIGN_PARTNER_SPRINT_2026-07-08.md) | Planned design-partner sprint gated on compliance and approvals. |

## Historical / superseded material

| Document | Status |
| --- | --- |
| [mobile-web-native-strategy-audit.md](./mobile-web-native-strategy-audit.md) | Historical strategy context; verify against `CLIENT_SURFACES.md` before implementation. |

## Documentation hygiene rules

- Every Markdown file under `docs/` must be linked exactly once from this index.
- Canonical contracts define current behavior. Operating runbooks must defer to them.
- Dated audits are evidence snapshots unless explicitly promoted into a canonical contract.
- New documents must state their lifecycle: canonical, operating, evidence, planned, historical, or generated.
- Durable product rules belong in code or canonical docs, not repeated across point-in-time audits.
- Generated local reviews, screenshots, visual-QA output, branch plans, environment mirrors, and temporary agent files do not belong in source control.
- When an evidence snapshot contains a decision that remains true, promote it into the relevant canonical document and leave the snapshot as provenance.

## Verification

- `npm run docs:check` verifies required sections, required root contracts, complete indexing, and duplicate-link absence.
- `npm run verify` includes documentation, source-control, route, OpenAPI, token, Stripe, build, and server-smoke checks.
- `npm run verify:full` adds TypeScript, ESLint, authz, CSP, runtime-policy, security, full tests, and browser-extension packaging.
- `GET /api/health` is the public deployment health probe.
