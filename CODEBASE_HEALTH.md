# Codebase Health

## TypeScript strictness progress

The project keeps global TypeScript compatibility in `tsconfig.json` while hardening a strict allowlist in `tsconfig.strict.json`. Use the strict coverage report to decide which pure-helper modules to harden next without changing source files.

Run:

```sh
npm run strict:coverage
```

Current snapshot from `scripts/strict-coverage.mjs` on 2026-06-13:

| Metric | Count |
| --- | ---: |
| Non-test `src/**/*.ts` / `src/**/*.tsx` files | 692 |
| Files included by `tsconfig.strict.json` | 83 |
| Non-test files included by `tsconfig.strict.json` | 46 |
| Overall non-test strict coverage | 6.6% |

### Strict coverage by top-level folder

| Folder | Strict non-test files | Total non-test files | Coverage |
| --- | ---: | ---: | ---: |
| `src/lib` | 43 | 264 | 16.3% |
| `src/routes` | 0 | 97 | 0.0% |
| `src/components` | 0 | 260 | 0.0% |
| `src/pages` | 0 | 17 | 0.0% |
| `src/hooks` | 0 | 10 | 0.0% |
| `src/services` | 0 | 7 | 0.0% |

### Suggested next low-risk pure-helper modules

These are non-test files not already included by `tsconfig.strict.json`. The script prefers small helper-like modules with peer tests and down-ranks React, DB, server, network, environment, and vendor-client code.

1. `src/lib/director-feature-flags.ts`
2. `src/lib/internal-jwt-secret.ts`
3. `src/lib/action-types.ts`
4. `src/lib/api-row.ts`
5. `src/lib/apply-dom-layout.ts`
6. `src/lib/audit-summary.ts`
7. `src/lib/claude-brain.ts`
8. `src/lib/claude-supervisor-tools.ts`
9. `src/lib/demo-funnel-shared.ts`
10. `src/lib/design-preview-route.ts`

After adding any candidate to `tsconfig.strict.json`, verify the allowlist remains clean:

```sh
npm run lint:strict
```
