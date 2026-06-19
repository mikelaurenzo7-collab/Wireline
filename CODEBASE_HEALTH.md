# Codebase Health

## 2026-06-19 cleanup passes

Wireline is in an active Stitch Studio migration. The health goal is to keep the product surface small, buildable, and free of stale agent scratch work, duplicated design rules, and dead framework paths.

### Purged

- Removed tracked `.agents/` scratch work, including stale project rules and multi-agent handoff material.
- Removed `.cursor/skills/` dogfood and QA playbooks that duplicated work, embedded temporary test context, and enforced retired design directions.
- Removed `terminals/` QA reports and unreferenced visual sweep scripts that were writing local artifacts and carried stale demo context.
- Removed the retired Grok Flair design stub, stale UI audit, unused iOS token wrapper, and the obsolete Next-style director route.
- Added `.agents/`, `.cursor/`, `scratch/`, and `terminals/` to `.gitignore` so temporary artifacts cannot return through normal commits.

### Normalized

- iOS widgets and Android widgets now derive from one current Stitch Noir palette per platform instead of duplicated Lavender Noir constants.
- The active Studio remains the visual source of truth: `src/components/AgentStudioCanvas.tsx` and `src/styles/stitch-studio.css`.
- The public marketing shell remains isolated from the authenticated Studio so a Studio migration cannot accidentally change public first-paint behavior.

### Guardrail

Do not add planning-output folders, AI-agent transcripts, local QA reports, temporary database probes, hardcoded test credentials, or one-off visual scripts to source control. Product code, durable docs, and repeatable scripts stay; temporary artifacts stay local.

## Verification posture

- Current migration gate: `npm run verify` (`build` + bundled-server smoke)
- Full legacy gate when intentionally hardening: `npm run verify:full`
- Strictness inventory: `npm run lint:strict`

## TypeScript strictness progress

The project keeps global TypeScript compatibility in `tsconfig.json` while hardening a strict allowlist in `tsconfig.strict.json`. Suggested low-risk pure-helper modules from the prior strictness snapshot:

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
