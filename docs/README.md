# Wireline Documentation

Wireline is a personal AI call assistant. The authenticated product begins in **Agent Studio**: create an agent, teach it through a conversation, and connect the services it needs.

## Active product surface

| Area | Source | Purpose |
| --- | --- | --- |
| Agent Studio | `src/pages/AgentStudioHome.tsx` | Create an agent, save its instructions, review its essentials, and connect integrations. |
| Product foundation | `src/index.css`, `src/styles/foundation.css` | Small warm-native token layer and Studio primitives. |
| Routing | `src/routes/AppRoutes.tsx` | Studio-first routing. Historical operations URLs redirect to `/agents`. |
| Agent configuration | `src/routes/agent-routes.ts` | Authenticated creation, ownership enforcement, and instruction extraction. |

## System references

| Document | Purpose |
| --- | --- |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | Current system boundaries and data flows. |
| [DATABASE_SETUP.md](../DATABASE_SETUP.md) | Database connection and migration guidance. |
| [DEPLOY.md](../DEPLOY.md) | Deployment and environment runbook. |
| [CONTRIBUTING.md](../CONTRIBUTING.md) | Contribution and verification guidance. |

## Verification

- `npm run verify` — production build plus bundled-server import smoke.
- `npm run verify:full` — type checks, authorization coverage, CSP policy consistency, docs/pricing check, tests, build, and smoke.
- `GET /api/health` — deployment health probe.

The repository deliberately has no visual contract, UI-ratchet baseline, design-preview layer, or hotfix stylesheet. Keep functional and security tests intact; do not create a new design gate until the product direction is stable.
