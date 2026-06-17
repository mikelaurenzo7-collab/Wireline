# Fix playbook — beast findings → code

When **fix-as-you-go** is on, use this map. Always minimal diff; `npm run verify` after.

## Symptom → first file

| Symptom | Likely files | Verify live |
|---------|--------------|-------------|
| Sidebar clips content | `Sidebar.tsx` (`--wireline-rail-w`), `AppShell.tsx` | Email title at 1440 |
| Eternal "Connecting to Director" | `useStreamingChat.ts`, `director-routes.ts`, `DirectorWorkspace.tsx` | Fleet audit probe |
| "Director data could not be loaded" | `director-store.ts`, migrations `thread_key` | Fresh cleared thread |
| Proposal card missing | `ProposalCard.tsx`, director execute routing | Jordan Lee prompt |
| Coach context wrong | `DirectorComposerContextStrip.tsx`, URL `?agent=` | Coach pick + strip |
| Painter preview empty | `pages/Design.tsx`, `director-design-orchestrator.ts` | Debt relief probe |
| Stale route content | `PageTransition`, route lazy loading | Fast sidebar switching |
| Off-brand colors | `index.css`, `brand-colors.ts` | design-bar audit |
| Touch targets small | composer chips, approval buttons | 390px |
| Raw button regression | use `ShadButton` | `shadcn-pivot-ratchet` |
| CSP inline style | move to `index.css` + `data-*` | `npm run csp:check` |

## Fix order (when multiple P0s)

1. **Shell layout** — unblocks all route QA
2. **Director stream/hydration** — unblocks moat probes
3. **Execute/approval** — trust ladder
4. **Painter preview**
5. P1 design/craft

## Post-fix loop (mandatory)

1. Deploy or run local `npm run dev` if testing locally
2. **Regression mode** only for touched areas
3. Update `dogfood-report.md` — mark re-verified
4. Bump `scorecard.json` if dimensions improved

## Design fixes

Follow `.cursor/skills/wireline-design/`:

1. `wireline-system.md` + `csp-theming.md`
2. `surfaces.md` for file priority
3. `WL_DIRECTOR_CLASSES` / `wireline-director-design.ts` for Director copy
4. `npm run test:design` if contract changes

## Do not

- Weaken tests or coverage ratchets
- Add `style={` to TSX for quick fixes
- Hardcode model IDs
- Skip re-verify on prod after prod fix
