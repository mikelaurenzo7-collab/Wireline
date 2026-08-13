# Wireline Documentation

Wireline's public operating loop is **Build -> Train -> Launch -> Improve**. The repository still uses technical surface names such as Create, Training, Connections / Wire, Phone, Inbox, and Studio; those describe implementation ownership, not a competing customer-facing brand spine. Current launch positioning and creative status are governed by the launch source of truth indexed under Operating and release runbooks below.

Broad public copy uses **voice agents** for personal and business conversations. Personal workspaces create **personal agents**. Business workspaces may describe role-specific **sales agents** or **support agents** when the context is explicit. Never pair "AI" with "agent" in copy: see `CUSTOMER_TERMINOLOGY.md`. Technical contracts retain `agent`. Every included agent has an **included number**. Outbound, inbound, and hybrid modes are first-class.

This file maps current doctrine, operating runbooks, and active plans. Dated audits and superseded decision evidence live in [AUDIT_INDEX.md](./AUDIT_INDEX.md).

## Product surfaces

| Surface | Source | Release posture |
| --- | --- | --- |
| Web and API | `src/`, `server.ts`, `api/` | **Live** canonical runtime. |
| Create | `src/pages/AgentStudioHome.tsx`, `src/components/CreateAgentDialog.tsx` | Short intake for name, role, voice, personality, and starting brief. |
| Training | `src/pages/KnowledgePage.tsx`, `src/components/KnowledgeBaseClaude.tsx`, `src/components/training/` | Deep configuration, sources, behavior, policy, evaluation, and memory. |
| Wire | `src/pages/ConnectionsPage.tsx`, `src/pages/SalesforceIntegrationPage.tsx` | Numbers, integrations, routing, approvals, billing, and launch controls. |
| Run / Studio | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx` | Calls, texts, follow-up, approvals, handoff, and review. |
| Wireline Command | `apps/browser-extension/` | **Early access** explicit-action browser handoff. |
| iOS | `ios/` | **Planned** until signing, physical-device acceptance, privacy review, and TestFlight. |
| Android | `android/` | **Internal beta** until device acceptance, signing, privacy review, and Play release. |
| ChatGPT App | `src/routes/chatgpt-mcp-*`, `src/lib/chatgpt-mcp-*`, `api/mcp.ts` | **Early access** account-bound MCP/OAuth surface. |
| Video presenters | `src/lib/video-presenter/`, `src/components/LiveVideoPresenter.tsx` | **Live paid add-on** for eligible business agents; 60 reserved minutes monthly, 5-minute sessions, provider-fail-closed. |

## Product interface rules

- Public pages explain. Authenticated pages execute.
- Create stays short; Training owns detailed setup.
- Wire owns numbers, integrations, routing, connected tools, approvals, billing, and live launch controls.
- Studio is the workroom; Overview is the calm command center.
- Use labels, tabs, icons, state, and clear next actions instead of explanatory paragraphs on active work surfaces.
- Phone / Call History and Analytics may explain history, coaching, exports, and insights.
- Inbound and hybrid are first-class selectable modes, not fallback copy.
- Wireline Command remains explicit-user-action only.

## Canonical repository and system documents

| Document | Role |
| --- | --- |
| [README.md](../README.md) | Repository entry point, current product map, setup, and verification. |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Branch, review, migration, validation, and release workflow. |
| [CODEBASE_HEALTH.md](../CODEBASE_HEALTH.md) | Source-control boundaries, deletion policy, and maintainability standards. |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Runtime boundaries, data flow, provider posture, and security invariants. |
| [CUSTOMER_TERMINOLOGY.md](./CUSTOMER_TERMINOLOGY.md) | Customer-language contract for personal, business, and technical contexts. |
| [ONE-AGENT-STRATEGY.md](./ONE-AGENT-STRATEGY.md) | Agent-first positioning and roster-compatible launch framing. |
| [CLIENT_SURFACES.md](./CLIENT_SURFACES.md) | Web, browser, native, ChatGPT, and presenter ownership and release boundaries. |
| [CHATGPT_APP.md](./CHATGPT_APP.md) | ChatGPT App behavior, OAuth, tool boundaries, and release verification. |
| [business-usage-pricing-decision.md](./business-usage-pricing-decision.md) | Canonical billing model and Runtime Balance posture. |
| [BILLING_RUNBOOK.md](./BILLING_RUNBOOK.md) | Checkout, entitlement, webhook, cancellation, and reconciliation proof. |
| [PRODUCT_SHOWCASE_MATRIX.md](./PRODUCT_SHOWCASE_MATRIX.md) | Whole-product feature and commercial-status matrix. |
| [TRUST_CONVERSION_PACK.md](./TRUST_CONVERSION_PACK.md) | Customer-facing trust, compliance, and proof posture. |
| [LAUNCH_READINESS_AND_MARGIN.md](./LAUNCH_READINESS_AND_MARGIN.md) | Launch readiness and account-level margin operating model. |
| [RECAP_AND_PROPOSAL_ARTIFACTS.md](./RECAP_AND_PROPOSAL_ARTIFACTS.md) | Shareable recap/proposal artifact contract and entitlement boundaries. |
| [COMPANY_IDENTITY_PACK.md](./COMPANY_IDENTITY_PACK.md) | Number, calling, SMS, and email identity boundaries. |
| [PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md](./PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md) | Production PSTN, realtime demo, presenter, and marketing-audio provider boundary. |
| [GROK_LIVE_VOICE.md](./GROK_LIVE_VOICE.md) | Retired xAI realtime route and current OpenAI Realtime ownership. |
| [VENDOR_LAUNCH_MAP.md](./VENDOR_LAUNCH_MAP.md) | Vendor and surface status: live, beta, planned, or retire. |
| [ACCESSIBILITY.md](./ACCESSIBILITY.md) | Product accessibility commitment. |
| [design-system-responsive-roadmap.md](./design-system-responsive-roadmap.md) | Responsive, spacing, and component-containment rules. |
| [AGENT_CUSTOMIZATION_ARCHITECTURE.md](./AGENT_CUSTOMIZATION_ARCHITECTURE.md) | Agent customization client/domain boundary. |
| [security/auth-password-controls.md](./security/auth-password-controls.md) | Custom scrypt and HIBP password-control posture. |
| [soc2-policies.md](./soc2-policies.md) | SOC 2 control-policy map and evidence ownership. |
| [AUTHZ_MATRIX.md](./AUTHZ_MATRIX.md) | Generated authorization-coverage artifact. |

## Operating and release runbooks

| Document | Role |
| --- | --- |
| [DATABASE_OPERATIONS.md](./DATABASE_OPERATIONS.md) | Shared Postgres, migration, RLS, privilege, and rollback operations. |
| [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md) | Exact-head preview, production promotion, environment, migration, and rollback workflow. |
| [RESEND_DELIVERY_FEEDBACK.md](./RESEND_DELIVERY_FEEDBACK.md) | Signed Resend feedback receiver, provider suppression semantics, activation, and rollback. |
| [IOS_APP_STORE_CARPLAY_READINESS.md](./IOS_APP_STORE_CARPLAY_READINESS.md) | iOS signing, App Review, native capability, physical-device, and entitlement-gated CarPlay release checks. |
| [FOUNDER_LAUNCH_COMMAND_CENTER.md](./FOUNDER_LAUNCH_COMMAND_CENTER.md) | Founder go/no-go, runtime, GTM, KPI, support, and rollback command center. |
| [LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md](./LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md) | Active launch positioning, creative status, pre-customer proof rules, and publish gate. |
| [LAUNCH_GURU_PLAYBOOK_2026-07-20.md](./LAUNCH_GURU_PLAYBOOK_2026-07-20.md) | Current launch sequence and operating playbook. |
| [LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md](./LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md) | Creative doctrine, asset inventory, and channel placement. |
| [WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md](./WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md) | Current launch campaign pack, claims, scripts, UTMs, and activation QA. |
| [P0_BILLING_OPS_NOTE.md](./P0_BILLING_OPS_NOTE.md) | Founder catalog lock and live billing proof checklist. |
| [DEMO_DATA_RESET_QA_CHECKLIST_2026-07-07.md](./DEMO_DATA_RESET_QA_CHECKLIST_2026-07-07.md) | Dry-run-first demo reset, reseed, and screenshot QA. |
| [OPS_CREDENTIALS_CHECKLIST_2026-07-07.md](./OPS_CREDENTIALS_CHECKLIST_2026-07-07.md) | DNC, Redis, Sentry, and scale-readiness environment checklist. |
| [MULTI_SURFACE_QA_2026-07-07.md](./MULTI_SURFACE_QA_2026-07-07.md) | Browser, native, and ChatGPT QA rituals. |
| [HARNESS_WINGMAN.md](./HARNESS_WINGMAN.md) | Operations and infrastructure harness doctrine. |
| [CHATGPT_APP_DASHBOARD_CONFIG.md](./CHATGPT_APP_DASHBOARD_CONFIG.md) | OAuth/CIMD dashboard registration record. |
| [CHATGPT_APP_SUBMISSION.md](./CHATGPT_APP_SUBMISSION.md) | Submission and reviewer contract. |
| [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md) | Incident classification, containment, communication, and recovery. |
| [SLA.md](./SLA.md) | Service-level commitments. |
| [LOAD_TEST.md](./LOAD_TEST.md) | Load-test methodology for voice webhook ingress. |
| [accessibility-e2e-gate.md](./accessibility-e2e-gate.md) | Critical-route accessibility gate policy. |

## Active strategy and planned work

| Document | Role |
| --- | --- |
| [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md) | Current product, UX, KPI, and implementation roadmap. |
| [WIRELINE_LEVEL_UP_MASTER_PLAN.md](./WIRELINE_LEVEL_UP_MASTER_PLAN.md) | Phased product, trust, cost, and multi-surface execution plan. |
| [AURORA_MASTERPLAN.md](./AURORA_MASTERPLAN.md) | Brand, marketing, onboarding, product, and operations plan. |
| [RESEARCH_OPERATING_SYSTEM.md](./RESEARCH_OPERATING_SYSTEM.md) | Research lanes, prioritization, metrics, and execution horizon. |
| [GUIDED_AGENT_SETUP_2026-07-08.md](./GUIDED_AGENT_SETUP_2026-07-08.md) | Guided call-plan setup doctrine (retired 2026-08-13; historical record). |
| [VERIFIED_VOICE_MOAT_AND_PARTNER_STRATEGY.md](./VERIFIED_VOICE_MOAT_AND_PARTNER_STRATEGY.md) | Provider-neutral voice moat and partner sequence. |
| [PRESENTER_VENDOR_STRATEGY.md](./PRESENTER_VENDOR_STRATEGY.md) | Presenter vendor matrix and business-presence roadmap. |
| [OPERATOR_SUCCESS.md](./OPERATOR_SUCCESS.md) | Operational success and support motion. |
| [REFERRAL_LOOP_SPEC_2026-07-07.md](./REFERRAL_LOOP_SPEC_2026-07-07.md) | Planned Runtime Balance referral loop. |
| [DESIGN_PARTNER_SPRINT_2026-07-08.md](./DESIGN_PARTNER_SPRINT_2026-07-08.md) | Planned design-partner sprint and entry gates. |

## Documentation rules

- Every durable Markdown file under `docs/` must be linked from exactly one of `docs/README.md` or `docs/AUDIT_INDEX.md`.
- Canonical doctrine, runbooks, and active plans belong here. Dated audit evidence and superseded decisions belong in `AUDIT_INDEX.md`.
- A dated file is not automatically historical, but its current role must be explicit in one index.
- Generated review output, screenshots, local agent artifacts, exported environments, branch summaries, and temporary plans do not belong in source control.
- When evidence produces a durable decision, promote that decision into code or a canonical document.

### Repository-local Markdown exceptions

These files stay outside `docs/` because a development tool, compatibility path, or source-owning surface discovers them at an exact repository location. This table is the sole approval source used by `npm run docs:check`; each file must remain narrow and defer cross-cutting doctrine to the canonical documents above.

| Document | Why it remains local |
| --- | --- |
| [AGENTS.md](../AGENTS.md) | Cursor Cloud discovery instructions at the required root path. |
| [CLAUDE.md](../CLAUDE.md) | Claude Code discovery instructions at the required root path. |
| [DATABASE_SETUP.md](../DATABASE_SETUP.md) | Narrow compatibility pointer to the canonical database runbook. |
| [DEPLOY.md](../DEPLOY.md) | Narrow compatibility pointer retained for legacy links, development-tool discovery, and regression contracts. |
| [apps/browser-extension/README.md](../apps/browser-extension/README.md) | Browser-extension entry point beside its source and build script. |
| [android/README.md](../android/README.md) | Android build, signing, push, Telecom, consent, and release entry point beside its source. |
| [ios/README.md](../ios/README.md) | iOS architecture, build, widgets, intents, and release entry point beside its source. |
| [references/design-system-navigation-plan.md](../references/design-system-navigation-plan.md) | Exact path consumed by the design-system regression contract. |

## Verification

- `npm run source-control:check` validates ignored/tracked drift, forbidden local artifacts, and case-collision safety.
- `npm run docs:check` validates required canonical links, every local Markdown target, duplicate index entries, complete `docs/` indexing, and tracked Markdown classification.
- `npm run verify` runs repository checks, design/routes/OpenAPI/token/Stripe checks, a production build, and server smoke.
- `npm run verify:full` adds TypeScript, ESLint, authorization, CSP, runtime-policy, security-audit, test, and browser-extension gates.
- `GET /api/health` is the deployed health probe.
