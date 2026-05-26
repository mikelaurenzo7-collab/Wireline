# Wireline Documentation

Quick links to every operational and technical document in this repository.

---

## Architecture & Design

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](../ARCHITECTURE.md) | System design, LLM tiering, data flows, upgrade paths |
| [DATABASE_SETUP.md](../DATABASE_SETUP.md) | Schema overview, indexes, RLS, connection config, troubleshooting |

## Operations

| Document | Purpose |
|----------|---------|
| [DEPLOY.md](../DEPLOY.md) | Deployment runbook — Vercel, env vars, DNS, troubleshooting |
| [scripts/restore-drill.md](../scripts/restore-drill.md) | Disaster recovery PITR drill — RTO/RPO measurement |
| [OPERATOR_SUCCESS.md](./OPERATOR_SUCCESS.md) | Activation ladder, quality checklist, north-star metrics |

## Getting Started

| Document | Purpose |
|----------|---------|
| [README.md](../README.md) | Project overview, quick start, tech stack, workflows |
| [marketing-kit/README.md](../marketing-kit/README.md) | Marketing asset index — screenshots, reels, copy |

---

## Conventions

- **Credentials** belong in environment variables and secrets managers — never in docs.
- **Runbooks** live at the top level or in `scripts/` alongside the tooling they document.
- **Product docs** (for operators/customers) ship via the app, not as markdown in the repo.
