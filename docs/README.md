# BotBound Documentation

BotBound's public story leads with capabilities, outcomes, and a clear signup action. It does not require a setup sequence. Inside the product, the post-create guide remains **Train -> Test -> Launch**. Technical surface names such as Create, Training, Connections, Phone, Inbox, and Studio describe implementation ownership. Current launch positioning and creative status are governed by the launch source of truth indexed under Operating and release runbooks below.

Broad public copy uses **Bot** or **Phone Bot**. Customers describe the job rather than choosing Personal or Business, and every role starter enters the same workspace model. Technical contracts retain `agent` and legacy plan/account identifiers for compatibility. Every active paid Bot has an included number. Outbound, inbound, and hybrid modes are first-class.

This file maps current doctrine, operating runbooks, and active plans. Dated audits and superseded decision evidence live in [AUDIT_INDEX.md](./AUDIT_INDEX.md).

## Product surfaces

| Surface          | Source                                                                                              | Release posture                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Web and API      | `src/`, `server.ts`, `api/`                                                                         | **Live** canonical runtime.                                                                          |
| Create           | `src/pages/AgentStudioHome.tsx`, `src/components/CreateAgentDialog.tsx`                             | Short intake for name, role, voice, personality, and starting brief.                                 |
| Training         | `src/pages/KnowledgePage.tsx`, `src/components/KnowledgeBaseClaude.tsx`, `src/components/training/` | Deep configuration, sources, behavior, policy, evaluation, and memory.                               |
| Connections      | `src/pages/ConnectionsPage.tsx`, `src/pages/SalesforceIntegrationPage.tsx`                          | Numbers, integrations, routing, approvals, billing, and launch controls.                             |
| Run / Studio     | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx`                         | Calls, texts, follow-up, approvals, handoff, and review.                                             |
| BotBound Command | `apps/browser-extension/`                                                                           | **Early access** explicit-action browser handoff; technical package names remain stable.             |
| iOS              | `ios/`                                                                                              | **Planned** until signing, physical-device acceptance, privacy review, and TestFlight.               |
| Android          | `android/`                                                                                          | **Internal beta** until device acceptance, signing, privacy review, and Play release.                |
| ChatGPT App      | `src/routes/chatgpt-mcp-*`, `src/lib/chatgpt-mcp-*`, `api/mcp.ts`                                   | **Early access** account-bound MCP/OAuth surface shared with Claude and Cursor.                      |
| Claude Connector | `docs/CLAUDE_CONNECTOR.md`, `https://botbound.me/mcp`                                               | **Early access** directory submission of the same remote MCP server.                                 |
| Cursor plugin    | `docs/CURSOR_PLUGIN.md`, `.mcp.json`, `plugin.json`, `mcp.json`                                     | **Early access** Cursor Directory package so a new user can create a BotBound account and first Bot. |
| Video presenters | `src/lib/video-presenter/`, `src/components/LiveVideoPresenter.tsx`                                 | **Retired live talking-head.** Identity badges only.                                                 |

## Product interface rules

- Public pages explain. Authenticated pages execute.
- Create stays short; Training owns detailed setup.
- Connections owns numbers, integrations, routing, connected tools, approvals, billing, and live launch controls.
- Studio is the workroom; Overview is the calm command center.
- Use labels, tabs, icons, state, and clear next actions instead of explanatory paragraphs on active work surfaces.
- Phone / Call History and Analytics may explain history, coaching, exports, and insights.
- Inbound and hybrid are first-class selectable modes, not fallback copy.
- BotBound Command remains explicit-user-action only.

## Canonical repository and system documents

| Document                                                                                         | Role                                                                              |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| [README.md](../README.md)                                                                        | Repository entry point, current product map, setup, and verification.             |
| [CONTRIBUTING.md](../CONTRIBUTING.md)                                                            | Branch, review, migration, validation, and release workflow.                      |
| [CODEBASE_HEALTH.md](../CODEBASE_HEALTH.md)                                                      | Source-control boundaries, deletion policy, and maintainability standards.        |
| [ARCHITECTURE.md](../ARCHITECTURE.md)                                                            | Runtime boundaries, data flow, provider posture, and security invariants.         |
| [CUSTOMER_TERMINOLOGY.md](./CUSTOMER_TERMINOLOGY.md)                                             | One-product customer-language contract and compatibility boundary.                |
| [ONE-AGENT-STRATEGY.md](./ONE-AGENT-STRATEGY.md)                                                 | Unified Bot positioning and roster-compatible launch framing.                     |
| [CLIENT_SURFACES.md](./CLIENT_SURFACES.md)                                                       | Web, browser, native, ChatGPT, and presenter ownership and release boundaries.    |
| [CHATGPT_APP.md](./CHATGPT_APP.md)                                                               | ChatGPT App behavior, OAuth, tool boundaries, and release verification.           |
| [CLAUDE_CONNECTOR.md](./CLAUDE_CONNECTOR.md)                                                     | Claude Connector Directory and MCP App behavior for the shared `/mcp` server.     |
| [CURSOR_PLUGIN.md](./CURSOR_PLUGIN.md)                                                           | Cursor Directory plugin package and account-bound MCP behavior.                   |
| [business-usage-pricing-decision.md](./business-usage-pricing-decision.md)                       | Canonical billing model and Runtime Balance posture.                              |
| [BILLING_RUNBOOK.md](./BILLING_RUNBOOK.md)                                                       | Checkout, entitlement, webhook, cancellation, and reconciliation proof.           |
| [PRODUCT_SHOWCASE_MATRIX.md](./PRODUCT_SHOWCASE_MATRIX.md)                                       | Whole-product feature and commercial-status matrix.                               |
| [TRUST_CONVERSION_PACK.md](./TRUST_CONVERSION_PACK.md)                                           | Customer-facing trust, compliance, and proof posture.                             |
| [LAUNCH_READINESS_AND_MARGIN.md](./LAUNCH_READINESS_AND_MARGIN.md)                               | Launch readiness and account-level margin operating model.                        |
| [RECAP_AND_PROPOSAL_ARTIFACTS.md](./RECAP_AND_PROPOSAL_ARTIFACTS.md)                             | Shareable recap/proposal artifact contract and entitlement boundaries.            |
| [COMPANY_IDENTITY_PACK.md](./COMPANY_IDENTITY_PACK.md)                                           | Number, calling, SMS, and email identity boundaries.                              |
| [PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md](./PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md) | Production PSTN, realtime demo, presenter, and marketing-audio provider boundary. |
| [OPENAI_REALTIME_VOICE.md](./OPENAI_REALTIME_VOICE.md)                                           | Canonical OpenAI Realtime browser and Twilio PSTN/SIP architecture.               |
| [VENDOR_LAUNCH_MAP.md](./VENDOR_LAUNCH_MAP.md)                                                   | Vendor and surface status: live, beta, planned, or retire.                        |
| [ACCESSIBILITY.md](./ACCESSIBILITY.md)                                                           | Product accessibility commitment.                                                 |
| [design-system-responsive-roadmap.md](./design-system-responsive-roadmap.md)                     | Responsive, spacing, and component-containment rules.                             |
| [AGENT_CUSTOMIZATION_ARCHITECTURE.md](./AGENT_CUSTOMIZATION_ARCHITECTURE.md)                     | Agent customization client/domain boundary.                                       |
| [security/auth-password-controls.md](./security/auth-password-controls.md)                       | Custom scrypt and HIBP password-control posture.                                  |
| [soc2-policies.md](./soc2-policies.md)                                                           | SOC 2 control-policy map and evidence ownership.                                  |
| [AUTHZ_MATRIX.md](./AUTHZ_MATRIX.md)                                                             | Generated authorization-coverage artifact.                                        |

## Operating and release runbooks

| Document                                                                                       | Role                                                                                                                                           |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| [DATABASE_OPERATIONS.md](./DATABASE_OPERATIONS.md)                                             | Shared Postgres, migration, RLS, privilege, and rollback operations.                                                                           |
| [DEPLOYMENT_RUNBOOK.md](./DEPLOYMENT_RUNBOOK.md)                                               | Exact-head preview, production promotion, environment, migration, and rollback workflow.                                                       |
| [OPENAI_REALTIME_OPERATIONS.md](./OPENAI_REALTIME_OPERATIONS.md)                               | OpenAI Realtime admission reserve, key rotation, in-flight drain, canary, and rollback operations.                                             |
| [BOTBOUND-AUTH-REDIRECT-CALLBACK-CHECKLIST.md](./BOTBOUND-AUTH-REDIRECT-CALLBACK-CHECKLIST.md) | Canonical-origin cutover inventory for sign-in, integration OAuth, MCP, webhooks, return URLs, deep links, and the launch-time Clerk decision. |
| [RESEND_DELIVERY_FEEDBACK.md](./RESEND_DELIVERY_FEEDBACK.md)                                   | Signed Resend feedback receiver, provider suppression semantics, activation, and rollback.                                                     |
| [AGENTMAIL_PRODUCTION_ACTIVATION.md](./AGENTMAIL_PRODUCTION_ACTIVATION.md)                     | Managed Bot email domain, credential, DNS, readiness, reconciliation, customer-domain, and rollback runbook.                                   |
| [IOS_APP_STORE_CARPLAY_READINESS.md](./IOS_APP_STORE_CARPLAY_READINESS.md)                     | iOS signing, App Review, native capability, physical-device, and entitlement-gated CarPlay release checks.                                     |
| [FOUNDER_LAUNCH_COMMAND_CENTER.md](./FOUNDER_LAUNCH_COMMAND_CENTER.md)                         | Founder go/no-go, runtime, GTM, KPI, support, and rollback command center.                                                                     |
| [LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md](./LAUNCH_SOURCE_OF_TRUTH_2026-08-11.md)                 | Active launch positioning, creative status, pre-customer proof rules, and publish gate.                                                        |
| [LAUNCH_GURU_PLAYBOOK_2026-07-20.md](./LAUNCH_GURU_PLAYBOOK_2026-07-20.md)                     | Current launch sequence and operating playbook.                                                                                                |
| [LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md](./LAUNCH_CREATIVE_MEDIA_KIT_2026-07-20.md)           | Creative doctrine, asset inventory, and channel placement.                                                                                     |
| [WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md](./WIRELINE_LAUNCH_CAMPAIGN_2026-07-26.md)             | Current launch campaign pack, claims, scripts, UTMs, and activation QA.                                                                        |
| [P0_BILLING_OPS_NOTE.md](./P0_BILLING_OPS_NOTE.md)                                             | Founder catalog lock and live billing proof checklist.                                                                                         |
| [DEMO_DATA_RESET_QA_CHECKLIST_2026-07-07.md](./DEMO_DATA_RESET_QA_CHECKLIST_2026-07-07.md)     | Dry-run-first demo reset, reseed, and screenshot QA.                                                                                           |
| [OPS_CREDENTIALS_CHECKLIST_2026-07-07.md](./OPS_CREDENTIALS_CHECKLIST_2026-07-07.md)           | DNC, Redis, Sentry, and scale-readiness environment checklist.                                                                                 |
| [MULTI_SURFACE_QA_2026-07-07.md](./MULTI_SURFACE_QA_2026-07-07.md)                             | Browser, native, and ChatGPT QA rituals.                                                                                                       |
| [HARNESS_WINGMAN.md](./HARNESS_WINGMAN.md)                                                     | Operations and infrastructure harness doctrine.                                                                                                |
| [CHATGPT_APP_DASHBOARD_CONFIG.md](./CHATGPT_APP_DASHBOARD_CONFIG.md)                           | OAuth/CIMD dashboard registration record.                                                                                                      |
| [CHATGPT_APP_SUBMISSION.md](./CHATGPT_APP_SUBMISSION.md)                                       | Submission and reviewer contract.                                                                                                              |
| [CLAUDE_CONNECTOR_SUBMISSION.md](./CLAUDE_CONNECTOR_SUBMISSION.md)                             | Claude Connectors Directory portal packet and reviewer contract.                                                                               |
| [CURSOR_PLUGIN_SUBMISSION.md](./CURSOR_PLUGIN_SUBMISSION.md)                                   | Cursor Directory submission packet and reviewer contract.                                                                                      |
| [INCIDENT_RESPONSE.md](./INCIDENT_RESPONSE.md)                                                 | Incident classification, containment, communication, and recovery.                                                                             |
| [SLA.md](./SLA.md)                                                                             | Service-level commitments.                                                                                                                     |
| [LOAD_TEST.md](./LOAD_TEST.md)                                                                 | Load-test methodology for voice webhook ingress.                                                                                               |
| [accessibility-e2e-gate.md](./accessibility-e2e-gate.md)                                       | Critical-route accessibility gate policy.                                                                                                      |

## Brand, campaign, and launch-film delivery

| Document                                                                                             | Role                                                                                           |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [BotBound brand workspace](../brand-work/README.md)                                                  | Brand-delivery entry point, Drive library, source/master split, and integrity workflow.        |
| [Current asset index](../brand-work/CURRENT-ASSET-INDEX.md)                                          | Canonical identity, campaign and GTM inventory, with creative candidates and release evidence. |
| [BotBound brand guide](../brand-work/BOTBOUND-BRAND-GUIDE.md)                                        | Identity, wordmark, typography, palette, spacing, and usage rules.                             |
| [Second Ring campaign](../brand-work/SECOND-RING-CAMPAIGN.md)                                        | Campaign platform, story system, claims, channel behavior, and commercial direction.           |
| [Launch copy kit](../brand-work/gtm/BOTBOUND-LAUNCH-COPY-KIT.md)                                     | Press, founder, social, email, OOH, CTA, UTM, and launch-sequence copy.                        |
| [GTM workspace](../brand-work/gtm/README.md)                                                         | Founder deck, copy-kit, and review-artifact handoff.                                           |
| [Brand font sources](../brand-work/fonts/README.md)                                                  | Licensed local font inventory and source notes for reproducible campaign rendering.            |
| [September launch workspace](../brand-work/launch-2026-09/README.md)                                 | Original inbound-led launch campaign, production map, and delivery guidance.                   |
| [September release pointer](../brand-work/launch-2026-09/CURRENT-RELEASE-POINTER.md)                 | Current release pointer for the original September launch library.                             |
| [September product proof](../brand-work/launch-2026-09/CURRENT_PRODUCT_PROOF.md)                     | Current-product proof and freshness contract for the original launch library.                  |
| [September launch provenance](../brand-work/launch-2026-09/PROVENANCE.md)                            | Source, generation, and review provenance for the original launch library.                     |
| [September paid-media notes](../brand-work/launch-2026-09/copy/PAID_MEDIA_AND_PLACEMENT_NOTES.md)    | Placement, channel, and media-buying guidance.                                                 |
| [September PR outreach](../brand-work/launch-2026-09/copy/PR_AND_CREATOR_OUTREACH.md)                | Press and creator outreach copy for the original launch.                                       |
| [September social posts](../brand-work/launch-2026-09/copy/SOCIAL_POSTS.md)                          | Social copy and channel adaptations for the original launch.                                   |
| [September investor one-pager](../brand-work/launch-2026-09/investor/BOTBOUND-INVESTOR-ONE-PAGER.md) | Investor-facing original launch narrative.                                                     |
| [Outbound asset audit](../brand-work/ASSET-AUDIT-2026-09-01.md)                                      | Exhaustive outbound-pass inventory, creative decisions, repairs, and certification record.     |
| [Outbound launch workspace](../brand-work/launch-2026-09-outbound/README.md)                         | Outbound-first production library, delivery map, render commands, and release links.           |
| [Outbound campaign copy](../brand-work/launch-2026-09-outbound/CAMPAIGN_COPY.md)                     | Paid, social, lifecycle, and launch copy for The First Move campaign.                          |
| [Outbound website messaging](../brand-work/launch-2026-09-outbound/WEBSITE_MESSAGING.md)             | Website message hierarchy that preserves inbound coverage while leading with outbound.         |
| [Outbound investor brief](../brand-work/launch-2026-09-outbound/INVESTOR_ONE_PAGER.md)               | Investor narrative for the outbound wedge and expansion path.                                  |
| [Outbound placement matrix](../brand-work/launch-2026-09-outbound/PLACEMENT_MATRIX.md)               | Candidate asset-to-channel mapping and placement guidance; publication remains gated.          |
| [Outbound accessibility copy](../brand-work/launch-2026-09-outbound/ALT_TEXT_AND_ACCESSIBILITY.md)   | Alt text, motion, contrast, and accessible publishing notes.                                   |
| [Outbound release provenance](../brand-work/launch-2026-09-outbound/PROVENANCE.md)                   | Source, model, render, QA, and checksum provenance for the outbound library.                   |
| [Outbound visual sources](../brand-work/launch-2026-09-outbound/sources/RUNWAY-SOURCES.md)           | Approved atmospheric source provenance and usage constraints.                                  |
| [Launch-film workspace](../apps/botbound-film/README.md)                                             | Remotion composition, render, caption, and review entry point.                                 |
| [Launch-film production notes](../apps/botbound-film/PRODUCTION_NOTES.md)                            | Timing, sound, scene, safe-area, and export direction.                                         |
| [Launch-film asset manifest](../apps/botbound-film/ASSET_MANIFEST.md)                                | Repository media inputs, provenance, and integrity hashes.                                     |
| [Launch-film verification](../apps/botbound-film/VERIFICATION.md)                                    | Composition, caption, render, and visual-review evidence.                                      |
| [Brand implementation QA](../design-qa.md)                                                           | Responsive visual comparison, interaction, accessibility, and browser-proof record.            |

## Active strategy and planned work

| Document                                                                                     | Role                                                                     |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [WIRELINE_LEVEL_UP_MASTER_PLAN.md](./WIRELINE_LEVEL_UP_MASTER_PLAN.md)                       | Phased product, trust, cost, and multi-surface execution plan.           |
| [RESEARCH_OPERATING_SYSTEM.md](./RESEARCH_OPERATING_SYSTEM.md)                               | Research lanes, prioritization, metrics, and execution horizon.          |
| [GUIDED_AGENT_SETUP_2026-07-08.md](./GUIDED_AGENT_SETUP_2026-07-08.md)                       | Guided call-plan setup doctrine (retired 2026-08-13; historical record). |
| [VERIFIED_VOICE_MOAT_AND_PARTNER_STRATEGY.md](./VERIFIED_VOICE_MOAT_AND_PARTNER_STRATEGY.md) | Provider-neutral voice moat and partner sequence.                        |
| [OPERATOR_SUCCESS.md](./OPERATOR_SUCCESS.md)                                                 | Operational success and support motion.                                  |
| [REFERRAL_LOOP_SPEC_2026-07-07.md](./REFERRAL_LOOP_SPEC_2026-07-07.md)                       | Planned Runtime Balance referral loop.                                   |
| [DESIGN_PARTNER_SPRINT_2026-07-08.md](./DESIGN_PARTNER_SPRINT_2026-07-08.md)                 | Planned design-partner sprint and entry gates.                           |

## Historical planning reference

| Document                                               | Classification                                                                                                                          |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| [WIRELINE_2026_ROADMAP.md](./WIRELINE_2026_ROADMAP.md) | Historical July 2026 planning snapshot. Current product language, packaging, launch posture, and roadmap live in the authorities above. |

## Documentation rules

- Every durable Markdown file under `docs/` must be linked from exactly one of `docs/README.md` or `docs/AUDIT_INDEX.md`.
- Canonical doctrine, runbooks, and active plans belong here. Dated audit evidence and superseded decisions belong in `AUDIT_INDEX.md`.
- A dated file is not automatically historical, but its current role must be explicit in one index.
- Generated review output, screenshots, local agent artifacts, exported environments, branch summaries, and temporary plans do not belong in source control.
- When evidence produces a durable decision, promote that decision into code or a canonical document.

### Repository-local Markdown exceptions

These files stay outside `docs/` because a development tool, compatibility path, or source-owning surface discovers them at an exact repository location. This table is the sole approval source used by `npm run docs:check`; each file must remain narrow and defer cross-cutting doctrine to the canonical documents above.

| Document                                                                                      | Why it remains local                                                                                                        |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| [AGENTS.md](../AGENTS.md)                                                                     | Cursor Cloud discovery instructions at the required root path.                                                              |
| [CLAUDE.md](../CLAUDE.md)                                                                     | Claude Code discovery instructions at the required root path.                                                               |
| [agents/wireline.md](../agents/wireline.md)                                                   | Cursor Directory agent discovery path for the BotBound MCP plugin.                                                          |
| [skills/wireline-voice-agent/SKILL.md](../skills/wireline-voice-agent/SKILL.md)               | Cursor Directory / Open Plugins skill discovery path.                                                                       |
| [DATABASE_SETUP.md](../DATABASE_SETUP.md)                                                     | Narrow compatibility pointer to the canonical database runbook.                                                             |
| [DEPLOY.md](../DEPLOY.md)                                                                     | Narrow compatibility pointer retained for legacy links, development-tool discovery, and regression contracts.               |
| [apps/browser-extension/README.md](../apps/browser-extension/README.md)                       | Browser-extension entry point beside its source and build script.                                                           |
| [android/README.md](../android/README.md)                                                     | Android build, signing, push, Telecom, consent, and release entry point beside its source.                                  |
| [ios/README.md](../ios/README.md)                                                             | iOS architecture, build, widgets, intents, and release entry point beside its source.                                       |
| [references/design-system-navigation-plan.md](../references/design-system-navigation-plan.md) | Exact path consumed by the design-system regression contract.                                                               |
| [Archived browser proof (2026-08-20)](../brand-work/exports/product-proof/README.md)          | Archived pre-cutover browser proof retained beside its generated artifacts; explicitly not current launch evidence.         |
| [.superdesign/design-system.md](../.superdesign/design-system.md)                             | Superdesign product, visual, interaction, content, and accessibility contract generated from the canonical BotBound system. |
| [.superdesign/init/components.md](../.superdesign/init/components.md)                         | Superdesign component inventory at the exact tool-discovery path.                                                           |
| [.superdesign/init/extractable-components.md](../.superdesign/init/extractable-components.md) | Superdesign reusable-component candidate inventory at the exact tool-discovery path.                                        |
| [.superdesign/init/layouts.md](../.superdesign/init/layouts.md)                               | Superdesign layout-source inventory at the exact tool-discovery path.                                                       |
| [.superdesign/init/pages.md](../.superdesign/init/pages.md)                                   | Superdesign page-source inventory at the exact tool-discovery path.                                                         |
| [.superdesign/init/routes.md](../.superdesign/init/routes.md)                                 | Superdesign route inventory at the exact tool-discovery path.                                                               |
| [.superdesign/init/theme.md](../.superdesign/init/theme.md)                                   | Superdesign theme and token inventory at the exact tool-discovery path.                                                     |

## Verification

- `npm run source-control:check` validates ignored/tracked drift, forbidden local artifacts, and case-collision safety.
- `npm run docs:check` validates required canonical links, every local Markdown target, duplicate index entries, complete `docs/` indexing, and tracked Markdown classification.
- `npm run verify` runs repository checks, design/routes/OpenAPI/token/Stripe checks, a production build, and server smoke.
- `npm run verify:full` adds TypeScript, ESLint, authorization, CSP, runtime-policy, security-audit, test, and browser-extension gates.
- `GET /api/health` is the deployed health probe.
