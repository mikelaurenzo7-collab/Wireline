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
| Files included by `tsconfig.strict.json` | 55 |
| Non-test files included by `tsconfig.strict.json` | 30 |
| Overall non-test strict coverage | 4.3% |

### Strict coverage by top-level folder

| Folder | Strict non-test files | Total non-test files | Coverage |
| --- | ---: | ---: | ---: |
| `src/lib` | 27 | 264 | 10.2% |
| `src/routes` | 0 | 97 | 0.0% |
| `src/components` | 0 | 260 | 0.0% |
| `src/pages` | 0 | 17 | 0.0% |
| `src/hooks` | 0 | 10 | 0.0% |
| `src/services` | 0 | 7 | 0.0% |

### Suggested next low-risk pure-helper modules

These are non-test files not already included by `tsconfig.strict.json`. The script prefers small helper-like modules with peer tests and down-ranks React, DB, server, network, environment, and vendor-client code.

1. `src/lib/marketing-mobile.ts`
2. `src/lib/nav-counts-invalidate.ts`
3. `src/lib/wireline-app-chrome.ts`
4. `src/lib/wireline-signal-design.ts`
5. `src/lib/app-url.ts`
6. `src/lib/brand-token.ts`
7. `src/lib/utils.ts`
8. `src/lib/wireline-painter-design.ts`
9. `src/lib/claude-response-helpers.ts`
10. `src/lib/client-design-brief-helpers.ts`

> The 2026-06-13 pass hardened `agent-entitlements`, `dialer-compliance`,
> `dnc-import-limits`, `safe-external-url`, `admin-access`, and
> `director-thread-keys` (with their test peers) — they are now in the
> allowlist above.

After adding any candidate to `tsconfig.strict.json`, verify the allowlist remains clean:

```sh
npm run lint:strict
```
