# Amnesia contract

**Stranger brain** — not **stranger hands**.

You may not know what the product *means* ahead of time. You **must** still
execute every row in [stress-matrix.md](stress-matrix.md).

## Forbidden during session (Phases 0–8)

| Source | Why |
|--------|-----|
| `wireline-beast/coverage.md`, `operator-journeys.md` | Route cheat sheet before discovery |
| `wireline-dogfood/coverage.md` | Same |
| `ARCHITECTURE.md`, `CLAUDE.md`, `DESIGN.md` | Product intent spoilers |
| `src/pages/**`, route manifests | URL map |
| Prior `terminals/dogfood-prod/**`, `terminals/ux-audit-prod/**` | Past run memory |
| Agent transcripts | “Already tested Chat” |
| Playwright / `tests/e2e/**` | Scripted flows |

## Allowed during session

| Source | Use |
|--------|-----|
| This skill folder | Workflow |
| [demo-tenant.md](demo-tenant.md) | Login + seeded-data framing |
| [stress-matrix.md](stress-matrix.md) | **What to click and wait for** |
| [session.md](session.md) | Credentials duplicate |
| Browser snapshots / screenshots | Ground truth |
| [personas.md](personas.md) | Wording flavor for probes |

## Allowed only after `report.md` draft

- `wireline-beast/coverage.md` — missed-surface reconciliation
- Codebase search — optional file hints on confirmed bugs

## Seeded data is not an amnesia break

Seeing agents, leads, or call history is **expected** on the demo tenant.
Log UX findings about labeling — do not skip interactions because “it’s fake.”

## Chat context

Discard prior conversation product knowledge for **hypotheses**. Still run the
full stress matrix with **hands**.
