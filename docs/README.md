# Wireline Documentation

Quick links to operational and technical documents in this repository.

---

## Architecture & Design

| Document                                  | Purpose                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| [ARCHITECTURE.md](../ARCHITECTURE.md)     | System design, LLM tiering, data flows, upgrade paths             |
| [DATABASE_SETUP.md](../DATABASE_SETUP.md) | Schema overview, indexes, RLS, connection config, troubleshooting |
| [CONTRIBUTING.md](../CONTRIBUTING.md)     | Onboarding, workflow, code standards, security checklist          |
| [`src/components/AgentStudioCanvas.tsx`](../src/components/AgentStudioCanvas.tsx) | Active Stitch-inspired Studio implementation |
| [`src/styles/stitch-studio.css`](../src/styles/stitch-studio.css) | Shared Stitch panel, grid, scroll, icon, and kicker primitives |

## Current UI migration

Wireline is actively moving to the Stitch-inspired dark Studio direction. The old standalone design-contract docs were retired to prevent design drift during migration. For Studio work, treat the implementation files above as the current source of truth until stricter contracts are reintroduced after visual approval.

## Operations

| Document                                                | Purpose                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| [DEPLOY.md](../DEPLOY.md)                               | Deployment runbook — Vercel, env vars, DNS, troubleshooting   |
| [docs/soc2-policies.md](./soc2-policies.md)             | SOC 2 control narrative, evidence sources, and remaining gaps |
| [scripts/restore-drill.md](../scripts/restore-drill.md) | Disaster recovery PITR drill — RTO/RPO measurement            |
| [OPERATOR_SUCCESS.md](./OPERATOR_SUCCESS.md)            | Activation ladder, quality checklist, north-star metrics      |

## Security automation

| Check | Purpose |
| ----- | ------- |
| `npm run authz:check` | Regenerates `docs/AUTHZ_MATRIX.md` and fails if a route is neither protected nor explicitly allowlisted as public. |
| `npm run tenant-insert:check` | Guards service-role inserts into tenant-owned tables so new rows include an obvious `userId` or user-scoped values object. |
| `npm run api-error:check` | Enforces the API error-shape ratchet so legacy inline error responses do not regress. |

During the active Stitch migration, CI and `npm run verify` are intentionally narrowed to build + bundled-server smoke. Use `npm run verify:full` when intentionally running the legacy full gate.

## Getting Started

| Document                                              | Purpose                                              |
| ----------------------------------------------------- | ---------------------------------------------------- |
| [README.md](../README.md)                             | Project overview, quick start, tech stack, workflows |
| [marketing-kit/README.md](../marketing-kit/README.md) | Marketing asset index — screenshots, reels, copy     |

---

## Frontend & design implementation

| Resource | Purpose |
| -------- | ------- |
| [`src/components/AgentStudioCanvas.tsx`](../src/components/AgentStudioCanvas.tsx) | Active Studio surface |
| [`src/styles/stitch-studio.css`](../src/styles/stitch-studio.css) | Shared Stitch primitives |
| [`src/lib/wireline-director-design.ts`](../src/lib/wireline-director-design.ts) | Legacy Director constants still used by runtime surfaces |
| `npm run verify` | Current migration gate: build + smoke |
| `npm run verify:full` | Full legacy gate for later hardening |

## Conventions

- **Credentials** belong in environment variables and secrets managers — never in docs.
- **Runbooks** live at the top level or in `scripts/` alongside the tooling they document.
- **Product docs** for operators/customers ship via the app, not as markdown in the repo.
- **Generated docs** (`docs/AUTHZ_MATRIX.md`) are produced by `npm run authz:check` — edit the generator or route middleware, not the markdown by hand.
