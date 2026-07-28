# Contributing to Wireline

Wireline is a production SaaS monorepo. Changes must preserve tenant isolation, billing integrity, provider-cost controls, compliance gates, and the shared product contract across web, API, browser, native, and ChatGPT surfaces.

## Working model

1. Start from the latest `main` commit and create a focused branch.
2. Identify the canonical source before editing. Do not create a second source of truth to avoid touching the first.
3. Make the smallest coherent change that fixes the verified problem.
4. Add behavioral coverage for defects and durable contract coverage for architectural invariants.
5. Validate the exact branch head in Vercel before merge.
6. Squash merge only after review threads, deployment checks, and production-impact questions are closed.
7. Verify the promoted production SHA, database state, health endpoint, and runtime errors when the change can affect them.

## Change standards

- Prefer a verified win over speculative cleanup.
- Preserve current product behavior unless the change explicitly owns a behavior change.
- Keep credentials, tenant data, provider calls, billing decisions, authorization, and webhooks server-owned.
- Do not bypass a failing check by weakening the contract. Fix the implementation or document a narrow, evidence-backed exception with a retirement condition.
- Do not commit generated screenshots, review summaries, exported environment files, temporary patches, local tool output, archives, coverage, Playwright output, or build artifacts.
- Do not add `*-v2` wrappers, parallel design systems, duplicate product constants, or one-off markdown files that restate canonical policy.

## Verification ladder

Use the narrowest sufficient checks while developing, then run the full gate for high-risk work.

| Change | Minimum validation |
| --- | --- |
| Documentation or repository hygiene | `npm run source-control:check`, `npm run docs:check`, relevant contract tests |
| Isolated UI or product-copy change | Targeted tests, `npm run verify` |
| Shared runtime, routes, providers, auth, billing, compliance, CSP, data access, migrations | `npm run verify:full`, exact-head Vercel preview, targeted live/read-only probes |
| Browser extension | Root checks plus `node apps/browser-extension/scripts/build.mjs --check` |
| Native clients | Root contract checks plus the platform build and device/simulator acceptance defined in `docs/CLIENT_SURFACES.md` |
| ChatGPT App | Root checks plus the MCP discovery/OAuth/release checks in `docs/CHATGPT_APP.md` |

GitHub Actions may be unavailable because of account billing. That does not lower the release standard: the exact-head Vercel gate, CodeRabbit review, targeted provider checks, and production verification remain required.

## Database migrations

- Migrations are append-only. Never rewrite a migration that may have run outside a disposable local database.
- Backfill existing rows before adding a constraint that assumes the backfill.
- Make new invariants database-enforced when application helpers can swallow, reorder, or partially commit required state.
- Use deferred constraints when a valid transaction must create several related rows before commit.
- Lock down `SECURITY DEFINER` functions with an explicit `search_path` and revoked `PUBLIC` execution.
- Apply and probe production migrations only after the exact branch head is green. Probes must be transactional, non-destructive, and cleaned up.

## Documentation taxonomy

- `README.md`: repository entry point and current product map.
- `CONTRIBUTING.md`: change workflow and release discipline.
- `CODEBASE_HEALTH.md`: source-control, deletion, and maintainability policy.
- `ARCHITECTURE.md`: runtime boundaries and security invariants.
- `docs/README.md`: canonical product, system, runbook, and active-plan map.
- `docs/AUDIT_INDEX.md`: dated audit evidence and superseded decision records.

A durable document must be linked from exactly one documentation index. Dated review evidence belongs in `docs/AUDIT_INDEX.md`; it does not become product doctrine merely because it was accurate on the day it was written.

## Pull requests

A pull request should state:

- the verified problem and why it matters;
- the final behavior and important non-goals;
- migration, billing, tenancy, compliance, and provider-cost impact;
- tests and exact-head deployment evidence;
- production verification or an explicit reason it is not applicable;
- residual work that is deliberately not hidden inside the merge.

Dependency pull requests must be rebased onto current `main` and rerun tests for the exact packages they can affect. A green stale branch is not merge evidence.