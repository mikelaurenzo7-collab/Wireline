# BotBound engineering stack review — October 30, 2026

**Source:** remote `main` `cf95cfa0d62b3fbd9c921b7d3aad18730fb10d41`, with PR #1445 appearance changes inspected separately.
**Assessment:** Architecture/source inspection, dependency declarations, release scripts, and current GitHub run metadata. No local `npm ci`, build, profiler trace, production request-load test, or lockfile-wide vulnerability output was run in this session. This is **not a certification**.

## Decision

**Keep the architecture and tools. Do not move BotBound to Next.js/React Server Components, swap backend frameworks, or replace TypeScript solely for fashion.** The launch risk resides chiefly in verification, type coverage, dependency advisory triage, and avoiding redundant appearance CSS.

| Layer | Observed | Decision and evidence |
| --- | --- | --- |
| UI | React `^19.2.7`, React DOM, client-side `createRoot` + React Router `^8.3.0` | **Keep.** Route-level `lazy()`/Suspense already limits up-front page cost. Current React latest stable checked against official releases: 19.3.1 (2026-10-14); upgrade and lockfile refresh can happen separately after a green CI run. Do not represent React Server Components advisories as exploitable by this conventional SPA without evidence that affected packages/RSC endpoints are in the runtime. |
| Type safety | TypeScript `^6.0.3` with client, server, audit module and optional strict config | **Keep TS. Incrementally harden.** Root `tsconfig.json` does not set `strict: true`; `tsconfig.strict.json` includes only `src/lib/wireline-design-system.ts`. `scripts/strict-coverage.mjs` already identifies candidates. Baseline and raise strict coverage file-by-file with `npm run lint:strict` and peer tests, especially billing, tenant, realtime, and auth boundaries. Do not flip strict globally without a measured error budget. |
| Build | Vite `^6.4.5`, Tailwind `^4.3.1`, React plugin, esbuild backend bundle | **Keep for current release.** Vite 6.4 receives security patches per the Vite release policy; 8.3 gets regular updates. Test a Vite 8 migration *in a separate branch* with performance benchmark, React plugin compatibility, CSP and bundle review. Never mix this with theme rollout. Source maps intentionally disabled to avoid public source disclosure. |
| Component primitives | Radix, semantic tokens, Tailwind v4, limited shadcn compatibility wrappers | **Keep.** Single canonical DTCG dark tokens + explicit light overrides; avoid per-page hardcoded cream/white patches. The single `src/index.css` entrypoint imports dozens of historical polish tiers; reduce duplicated selector ownership gradually with screenshot regressions, not a blanket rewrite. |
| Backend | Node 22, Express `^4.22.2`, Drizzle/Postgres, dedicated voice worker + cron | **Keep.** Server, voice and jobs deployment identities are distinct. Express 5 migration could be explored in isolated tests with routing/async-middleware contracts, but not inside appearance PR. |
| Testing | Vitest 4.1.11, Playwright, accessibility checks; `coverage` thresholds 5% | **Raise behavioral coverage.** Many tests are source-text contracts rather than runtime UI behavior. Increase meaningful line/branch coverage in owner journeys (signup, first Bot, phone, inbox, checkout), and verify screenshots at mobile + desktop in both modes with forced-color/focus states. Five percent is a floor, not enough to declare launch-ready. |
| Quality / security | ESLint 9, react-hooks rules, source-control & authz & tenant & CSP gates; `scripts/check-security-audit.mjs` with explicit advisory acceptance | **Maintain and verify.** ESLint is syntax based (`parserOptions.project: false`), so add typed rules only to sensitive files later if runtime allows. A recent Render voice worker installation logged 13 npm advisories (11 moderate, 2 high); the exact dependency paths, production reachability and remediations have **not** been established. Avoid unreviewed `npm audit fix`. |
| Release automation | `.github/workflows/ci.yml` for PR, `verify-full.yml` for main; deploy on Render | **Release blocker**: GitHub API reported **0 workflow runs for PR #1445's branch** at inspection, and current `main` CI references `npm run csp:check` absent from `package.json`. Separate PR #1444 repairs the mismatch. Run CI at exact head before merging either PR; coordinate merge order and avoid duplicating unrelated fixes. |

## Two-pass decision matrix

1. **Pass A — safety/correctness:** Run `npm ci`, `npm run test:run`, `npm run lint`, `npm run lint:server`, `npm run lint:audit-modules`, `npm run lint:eslint`, `npm run design:check`, `npm run design:tokens:check`, `npm run build`, `npm run smoke:server`, `npm run test:e2e`. Capture actual npm advisory names/paths; prioritize exposed production vulnerabilities. Without runs, code review alone is not a release gate.
2. **Pass B — product-quality/performance:** Exercise real browser pages in both appearances at 320/390/768/1440px; ensure there are no warm/white canvas seams, cards and input borders read correctly, labels exceed AA contrast, drawers/modal controls remain accessible, and plan CTAs align. Benchmark JS entry bundles/long tasks/CLS before recommending Vite or React compiler changes. Use real production or representative data under authorized accounts; do not put PII in reports.

## Ordered next work

- **P0:** Restore GitHub PR execution, merge/rebase the CI `csp:check` repair from #1444 as appropriate, and run the actual gates. Validate that today's theme branch compiles and Playwright source-contract tests behave correctly.
- **P1:** Complete read-only authenticated light/dark visual QA, including settings/system preference, phone/inbox/studio, loading/empty/error states, mobile viewport and privacy notice.
- **P1:** Generate actionable npm audit report and remediate confirmed vulnerable reachable production packages; examine locked transitive packages rather than assuming latest declared semver equals installed version.
- **P2:** Gradually extend `tsconfig.strict.json` to pure, critical modules and ratchet meaningful behavior coverage above 5%. Keep server and voice runtime boundaries distinct.
- **P2:** Isolate React 19.3.1 and Vite 8.3 migrations into dedicated, measured upgrade PRs after launch correctness. Review Node 22 and Express 5 migrations on their own schedules.

**Guardrail:** No stack replatforming or dependency upgrades were performed in this design-review branch. Production data, billing, voice runtime, schemas and provider accounts were not changed by this review.
