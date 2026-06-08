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
- Total `style={{` count: **287** across **67** files (was 329)
- Biggest offender: `PreviewCards.tsx` (~118)
- CSP: `unsafe-inline` on style-src; Google Fonts in CSP (fonts already @fontsource)

## Phase status

| Phase | Description | Status | Commit |
|-------|-------------|--------|--------|
| 0 | Inventory + vercel.json sync + remove Google Fonts CSP | DONE | c048221 |
| 1 | Static inline styles → Tailwind/classes | DONE | (with phase 2 commit) |
| 2 | Dynamic theming → CSS variables | IN_PROGRESS | partial — AgentTemplates, AuthDemo, Stripe, AISpend |
| 3 | Motion/animation → CSS keyframes | PENDING | — |
| 4 | PreviewCards refactor | PENDING | — |
| 5 | Tighten prod CSP (drop unsafe-inline) | PENDING | — |
| 6 | Optional hardening | DEFERRED | — |

## Code review log

### Phase 0 (c048221)
- Fixed: removed dead `tsxBin()` in check-csp-drift.mjs
- OK: vercel.json synced via buildCSP(false); Google Fonts removed from app CSP
- OK: ratchet baseline committed; CI csp:check wired

### Phase 1-2 (pending commit hash)
- OK: safe-area migrations use Tailwind arbitrary values; FleetSettings uses `hidden` only
- OK: wl-accent-* reduces per-element color inline styles to one --wl-accent per root
- Remaining: PreviewCards (~118), motion components, AgentIntegrationCanvas

## Notes
- `daily-brief.ts` email HTML still uses Google Fonts — out of app CSP scope
- Dev keeps `style-src 'unsafe-inline'` for Vite HMR
