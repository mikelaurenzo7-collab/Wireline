# CSP Hardening Loop — Persistent State

> Agent memory across loop ticks. Update after each phase.

## User directives
- Work autonomously through all phases tonight
- Code-review after EVERY phase; fix findings before advancing
- Commits to preview branch (NOT main) until morning review
- Merge to origin/main only at beneficial intervals (phase boundaries if verified)
- Final E2E visual QA when all phases complete

## Branch
`feat/csp-hardening` (from main)

## Baseline (2026-06-08)
- Total `style={{` count: **328** across **78** files
- Biggest offender: `PreviewCards.tsx` (~118)
- CSP: `unsafe-inline` on style-src; Google Fonts in CSP (fonts already @fontsource)

## Phase status

| Phase | Description | Status | Commit |
|-------|-------------|--------|--------|
| 0 | Inventory + vercel.json sync + remove Google Fonts CSP | IN_PROGRESS | — |
| 1 | Static inline styles → Tailwind/classes | PENDING | — |
| 2 | Dynamic theming → CSS variables | PENDING | — |
| 3 | Motion/animation → CSS keyframes | PENDING | — |
| 4 | PreviewCards refactor | PENDING | — |
| 5 | Tighten prod CSP (drop unsafe-inline) | PENDING | — |
| 6 | Optional hardening | DEFERRED | — |

## Code review log
_(append after each phase)_

## Notes
- `daily-brief.ts` email HTML still uses Google Fonts — out of app CSP scope
- Dev keeps `style-src 'unsafe-inline'` for Vite HMR
