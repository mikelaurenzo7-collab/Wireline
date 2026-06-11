# Codebase Health

## TypeScript strictness progress

The project keeps global TypeScript compatibility in `tsconfig.json` while hardening a strict allowlist in `tsconfig.strict.json`. Use the strict coverage report to decide which pure-helper modules to harden next without changing source files.

Run:

```sh
npm run strict:coverage
```

Current snapshot from `scripts/strict-coverage.mjs` on 2026-06-11:

| Metric | Count |
| --- | ---: |
| Non-test `src/**/*.ts` / `src/**/*.tsx` files | 683 |
| Files included by `tsconfig.strict.json` | 43 |
| Non-test files included by `tsconfig.strict.json` | 24 |
| Overall non-test strict coverage | 3.5% |

### Strict coverage by top-level folder

| Folder | Strict non-test files | Total non-test files | Coverage |
| --- | ---: | ---: | ---: |
| `src/lib` | 21 | 255 | 8.2% |
| `src/routes` | 0 | 94 | 0.0% |
| `src/components` | 0 | 262 | 0.0% |
| `src/pages` | 0 | 19 | 0.0% |
| `src/hooks` | 0 | 10 | 0.0% |
| `src/services` | 0 | 7 | 0.0% |

### Suggested next low-risk pure-helper modules

These are non-test files not already included by `tsconfig.strict.json`. The script prefers small helper-like modules with peer tests and down-ranks React, DB, server, network, environment, and vendor-client code.

1. `src/lib/agent-entitlements.ts`
2. `src/lib/dialer-compliance.ts`
3. `src/lib/dnc-import-limits.ts`
4. `src/lib/safe-external-url.ts`
5. `src/lib/admin-access.ts`
6. `src/lib/director-thread-keys.ts`
7. `src/lib/marketing-mobile.ts`
8. `src/lib/nav-counts-invalidate.ts`
9. `src/lib/wireline-app-chrome.ts`
10. `src/lib/wireline-signal-design.ts`

After adding any candidate to `tsconfig.strict.json`, verify the allowlist remains clean:

```sh
npm run lint:strict
```
