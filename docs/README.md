# Wireline Documentation

Wireline is one agent platform across web, browser, mobile, and ChatGPT. The product model is `Create -> Train -> Run`, with Wire as the deliberate launch and integration layer.

## Active product surface

| Area | Source | Purpose |
| --- | --- | --- |
| Overview | `src/pages/OverviewPage.tsx` | Calm command center for agents, calls, connections, and Conversation Balance. |
| Create | `src/pages/AgentStudioHomeClaude.tsx`, `src/components/CreateAgentDialog.tsx` | Short intake for name, role, voice, personality, and starting brief. |
| Train | `src/pages/KnowledgePage.tsx`, `src/components/KnowledgeWorkspace.tsx`, `src/components/AgentAssetUpload.tsx` | Deep configuration for sources, documents, behavior, voice, policies, and evaluation. |
| Run | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx` | Chat-first execution for calls, texts, follow-up, approvals, and handoff. |
| Wire | `src/pages/ConnectionsPage.tsx`, `src/pages/SalesforceIntegrationPage.tsx` | Numbers, integrations, routing, connected tools, and launch controls. |
| Browser | `apps/browser-extension/` | Wireline Command: explicit page-context handoff into Studio. |
| Native | `ios/`, `android/` | Call-first control surfaces, widgets, notifications, and native approvals. |

## Current product rules

- Public pages explain. Authenticated pages execute.
- Use labels, tabs, icons, state, and clear next actions for authenticated orientation.
- Avoid authenticated page descriptions unless the user is reviewing history, coaching, analytics, exports, or past actions.
- Call Logs and Analytics may explain history, coaching, exports, and insights.
- User-facing language is `Agents`, `Training`, `Wire`, `Studio`, `calls`, `texts`, `follow-up`, and `Conversation Balance`.
- Overview is the calm command center; Studio is the workroom.
- Training owns the heavy configuration surface and document ingestion.
- Wire/Connections owns numbers, integrations, routing, connected tools, and launch controls.
- Studio is a chat-first workroom and does not have the old right context rail.
- Wireline Command is the browser surface name; do not restore the retired extension name.
- The design system is Wireline Letterpress / Wireline Clear System. Product chrome uses forest-green action, warm paper, ink text, and restrained status colors.

## System references

| Document | Purpose |
| --- | --- |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Current system boundaries and data flows. |
| [DATABASE_SETUP.md](../DATABASE_SETUP.md) | Database connection and migration guidance. |
| [DEPLOY.md](../DEPLOY.md) | Deployment and environment runbook. |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution and verification guidance. |
| [CLIENT_SURFACES.md](./CLIENT_SURFACES.md) | Repository boundaries across web, browser, native, and ChatGPT surfaces. |
| [RESEARCH_OPERATING_SYSTEM.md](./RESEARCH_OPERATING_SYSTEM.md) | Research lanes, prioritization, metrics, and 30/90/180-day execution roadmap. |
| [business-usage-pricing-decision.md](./business-usage-pricing-decision.md) | Billing model and Stripe catalog direction. |

## Verification

- `npm run verify:contracts` - focused product voice, authenticated page map, authenticated copy discipline, marketing metadata, static metadata, and event taxonomy contracts.
- `npm run verify` - design check, build, and bundled-server smoke.
- `npm run verify:full` - lint, design/authz/CSP checks, tests, build, and smoke.
- `npm run test:e2e` - Playwright homepage story, accessibility, and audience-tab smoke.
- `node apps/browser-extension/scripts/build.mjs --check` - browser extension contract and packaging smoke.
- `GET /api/health` - deployment health probe.
