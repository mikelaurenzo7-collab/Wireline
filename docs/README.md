# Wireline Documentation

Quick links to every operational and technical document in this repository.

---

## Architecture & Design

| Document                                  | Purpose                                                           |
| ----------------------------------------- | ----------------------------------------------------------------- |
| [ARCHITECTURE.md](../ARCHITECTURE.md)     | System design, LLM tiering, data flows, upgrade paths             |
| [DESIGN.md](../DESIGN.md)                 | Aurora Cream UI system — shadcn tiers, tokens, Director contract  |
| [DATABASE_SETUP.md](../DATABASE_SETUP.md) | Schema overview, indexes, RLS, connection config, troubleshooting |
| [CONTRIBUTING.md](../CONTRIBUTING.md)     | Onboarding, workflow, code standards, security checklist          |

## Operations

| Document                                                | Purpose                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| [DEPLOY.md](../DEPLOY.md)                               | Deployment runbook — Vercel, env vars, DNS, troubleshooting   |
| [docs/soc2-policies.md](./soc2-policies.md)             | SOC 2 control narrative, evidence sources, and remaining gaps |
| [scripts/restore-drill.md](../scripts/restore-drill.md) | Disaster recovery PITR drill — RTO/RPO measurement            |
| [OPERATOR_SUCCESS.md](./OPERATOR_SUCCESS.md)            | Activation ladder, quality checklist, north-star metrics      |

## Getting Started

| Document                                              | Purpose                                              |
| ----------------------------------------------------- | ---------------------------------------------------- |
| [README.md](../README.md)                             | Project overview, quick start, tech stack, workflows |
| [marketing-kit/README.md](../marketing-kit/README.md) | Marketing asset index — screenshots, reels, copy     |

---

## Frontend & design (implementation)

| Resource | Purpose |
| -------- | ------- |
| [`src/lib/wireline-director-design.ts`](../src/lib/wireline-director-design.ts) | Director copy, class names, capability catalog — single source of truth |
| [`src/lib/wireline-director-design.test.ts`](../src/lib/wireline-director-design.test.ts) | Contract tests for Director design constants |
| [`.cursor/skills/wireline-design/`](../.cursor/skills/wireline-design/) | Agent skill for UI upgrades (surfaces map, token reference) |
| `npm run test:design` | Vitest: design audit, shadcn ratchet, director contract |

Keep **DESIGN.md** (visual system) and **wireline-director-design.ts** (Director mission control) in sync when changing chat chrome, composer, or live-session UI.

## Conventions

- **Credentials** belong in environment variables and secrets managers — never in docs.
- **Runbooks** live at the top level or in `scripts/` alongside the tooling they document.
- **Product docs** (for operators/customers) ship via the app, not as markdown in the repo.
- **Generated docs** (`docs/AUTHZ_MATRIX.md`) are produced by `npm run authz:check` — edit the generator or route middleware, not the markdown by hand.
