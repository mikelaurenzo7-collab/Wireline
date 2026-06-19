# Codebase Health

## 2026-06-19 cleanup pass

This repository is in an active Stitch Studio migration. The current health goal is to keep the product surface small, buildable, and free of stale agent scratch work.

### Purged in this pass

- Removed the tracked `.agents/` scratch workspace files from the repository.
- Removed the tracked `scratch/` database inspection scripts that hardcoded a founder email and duplicated one-off agent analysis logic.
- Added `.agents/` and `scratch/` to `.gitignore` so temporary agent runs and local scripts do not get committed again.
- Improved the Stitch Studio mesh background so the app shell has richer layered depth without adding runtime dependencies.

### Active source of truth

- Studio UI: `src/components/AgentStudioCanvas.tsx`
- Stitch primitives and mesh: `src/styles/stitch-studio.css`
- Training route shell: `src/pages/Training.tsx`
- Migration gate: `npm run verify` (`build` + bundled-server smoke)
- Full legacy gate when intentionally hardening: `npm run verify:full`

### Guardrail

Do not add new planning-output folders, AI-agent transcripts, temporary database probes, or one-off scratch scripts to source control. Product code, durable docs, and repeatable scripts stay; temporary artifacts stay local.

## TypeScript strictness progress

The project keeps global TypeScript compatibility in `tsconfig.json` while hardening a strict allowlist in `tsconfig.strict.json`. Use the strict coverage report to decide which pure-helper modules to harden next without changing source files.

Run:

```sh
npm run lint:strict
```

Suggested next low-risk pure-helper modules from the previous strictness snapshot:

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
