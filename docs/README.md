# Wireline Documentation

Wireline is one agent platform across web, browser, mobile, and ChatGPT. The product model is `Create -> Train -> Run`.

## Active product surface

| Area | Source | Purpose |
| --- | --- | --- |
| Create | `src/pages/AgentStudioHome.tsx`, `src/components/CreateAgentDialog.tsx` | Short intake for name, role, voice, personality, and starting brief. |
| Train | `src/pages/KnowledgePage.tsx`, `src/components/KnowledgeWorkspace.tsx`, `src/components/AgentAssetUpload.tsx` | Deep configuration for sources, documents, behavior, voice, policies, and evaluation. |
| Run | `src/components/StudioWorkspaceV2.tsx`, `src/components/StudioWorkroom.tsx` | Chat-first execution for calls, texts, follow-up, approvals, and handoff. |
| Wire | `src/pages/ActionsPage.tsx`, `src/components/ActionsWorkspace.tsx` | Numbers, integrations, routing, connected tools, and launch controls. |
| Browser | `apps/browser-extension/` | Wireline Command: explicit page-context handoff into Studio. |
| Native | `ios/`, `android/` | Call-first control surfaces, widgets, notifications, and native approvals. |

## Current product rules

- User-facing language is `Agents`, `Training`, `Wire`, `Studio`, `calls`, `texts`, `follow-up`, and `Conversation Balance`.
- Training owns the heavy configuration surface and document ingestion.
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

- `npm run verify` - design check, build, and bundled-server smoke.
- `npm run verify:full` - lint, design/authz/CSP checks, tests, build, and smoke.
- `node apps/browser-extension/scripts/build.mjs --check` - browser extension contract and packaging smoke.
- `GET /api/health` - deployment health probe.
