# Repository Cleanup Pass — 2026-08-02

Status: **Historical evidence** — records a full-repository reachability, hygiene, and
organization pass against `origin/main` at `8547741`. Current policy remains
`CODEBASE_HEALTH.md`; this file explains what was inspected and what became durable.

## Scope

Every tracked path was inspected: `src/`, `tests/`, `scripts/`, `docs/`, `public/`, `api/`,
`apps/`, `drizzle/`, `.github/`, `android/`, `ios/`, and repository-root configuration.
Method was import-graph reachability from real entrypoints (`server.ts`, `src/main.tsx`,
`api/*`, `src/entrypoints/*`, Vitest discovery, `scripts/vercel-build.mjs`, CI workflows,
`index.html`), plus symbol-level reference checks on every candidate before deletion.

## What was removed

**Dead UI (0 importers, 0 contract references).** `integrations/PreviewCards.tsx` (954
lines), `ui/ArtifactCard.tsx`, `ui/LiveTaskPipeline.tsx`, `layout/PageTransition.tsx`, and
`ui/HaloButton.tsx` / `ui/VoidButton.tsx` — the last two already named as forbidden in
`src/lib/wireline-design-vision.ts`.

**Completed-migration bridges.** `components/ClaudeRecipes.tsx` and
`components/HelpTooltip.tsx`, plus the `ui/shadcn` compatibility layer: `Badge`, `Card`,
`Switch`, and `Textarea` were one-line re-exports of canonical atoms/molecules, and
`Alert`, `Avatar`, `Command`, `DropdownMenu`, `Label`, `Popover`, `Separator`, `Slider`,
`Tabs`, plus the unused barrel had no importer at all. `CODEBASE_HEALTH.md` lists thin
re-export bridges under "must be deleted when found".

**Unwired server scaffolding.** `middleware/bearer-auth.ts`, `middleware/performance.ts`,
`middleware/timeout.ts`, `lib/apply-dom-layout.ts`, `lib/email-prompt-safety.ts`,
`lib/request-context.ts`, `lib/sanitize-svg-preview.ts`. None was mounted or exported to a
live consumer, so removal is not a behavior change.

**Dependencies.** `cmdk`, `@radix-ui/react-label`, `@radix-ui/react-popover`, and
`@radix-ui/react-tabs` were reachable only from the deleted shadcn files. Verified by clean
`npm ci` plus production build.

**Static assets (~1.3 MB).** Four unreferenced `public/marketing/*.jpg`,
`public/product-hero.png`, `public/wireline-shopify-listing.png`, the orphan lockup and
wordmark SVGs, and `public/sw.js` — a service worker never registered anywhere in the
repository's history.

**Superseded scripts.** `audit-vercel-keys.mjs` (strict subset of
`check-vercel-env-health.mjs`), `backfill-vapi-phone-ids.mjs` and
`provision-live-video-stripe-env.mjs` (self-described completed one-offs), and
`check-atomic-design-completion.mjs`, which was unwired, threw against current source, and
duplicated the live `tests/atomic-design-system-contract.test.ts`.

## What was fixed rather than deleted

**Shipped browser extension was stale.** `public/downloads/wireline-command-*.zip` are
handed to real users by `BrowserCommandInstallPage.tsx`, but no build step regenerates
them, so they had silently drifted behind `apps/browser-extension/` and were serving
retired product copy. The packages were rebuilt, and
`tests/browser-extension-download-freshness-contract.test.ts` now reads the committed zips'
central directory and compares each entry's CRC-32 against its source file — hermetic, no
`zip`/`unzip` binary required. The contract was verified to fail on injected drift.

**Terminology.** The extension panel placeholder paired "AI" with "agent", which
`docs/CUSTOMER_TERMINOLOGY.md` rules out for customer-facing copy. Keyword metadata in
`index.html` is explicitly exempt and was left alone.

**Menu viewport containment.** The deleted `ui/shadcn/DropdownMenu.tsx` carried collision
padding, max-height, max-width, and scroll containment that canonical
`atoms/DropdownMenu.tsx` lacked. Those guarantees were ported to the canonical atom so the
invariant survived the duplicate's removal, and `ui-floating-surface-contract` now asserts
them there.

**Local machine path in source control.** `scripts/preview-recap-artifact.mts` hardcoded an
agent-session scratchpad directory. It now defaults to `os.tmpdir()` and creates its output
directory.

**Duplicated infrastructure identity.** The Vercel team and project IDs were copy-pasted
across eight scripts. `scripts/lib/vercel-project.mjs` is now the single source, with
`VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID` overrides for forks and duplicate projects.

**Committed generated snapshot.** `docs/LAUNCH_STATUS.generated.json` was a tracked
`npm run launch:status` output from a feature branch recording a stale `NO-GO`. It is now
ignored, and the two docs that cited it point at the command instead.

**Undiscoverable ops tooling.** Six reusable scripts had no `package.json` entry:
`vercel:env:health`, `vercel:promote-production`, `vercel:wait-deployment`,
`vapi:replay-pending-webhooks`, `lint:strict:candidates`, and `recap:preview`.

## Deliberately retained

- `src/lib/voice/audio-sniff.ts` — unwired but covered by `tests/audio-sniff.test.ts`;
  a tested defensive utility is scaffolding, not rot.
- `src/components/recipes/**` and the unmounted components under contract test
  (`AgentActionEngine`, `PhoneAgentBlueprint`, `TrialBanner`, `PublicSiteHeader`,
  `AgentPresenceLivePreview`) — retiring a tested surface is a product decision.
- `src/components/atoms/DropdownMenu.tsx` — barrel-exported canonical primitive with no
  current consumer; removing a design-system primitive is a design-system decision.
- `public/downloads/*.zip` — generated, but load-bearing for a live download page that the
  Vercel build does not reproduce. Making the build generate them depends on the `zip`
  binary being present in the Vercel image, which was not verifiable in this pass. The new
  freshness contract closes the actual risk.
- `react-is` — satisfies a `recharts` peer dependency.

## Verification

Full `verify:full` gate run locally: `lint`, `lint:server`, `lint:audit-modules`,
`lint:eslint`, `design:check`, `source-control:check`, `workflow:syntax:check`,
`route-registry:check`, `docs:check`, `openapi:check`, `design:tokens:check`,
`stripe:catalog:check`, `authz:check`, `tenant-insert:check`, `server:bootstrap:check`,
`tsconfig:excludes:check`, `csp:check`, `runtime:policy:check`, `api-error:check`,
`security:audit`, `test:run`, `build`, `smoke:server`, and the browser-extension policy
check — all passing. Tests: 276 files, 1512 passing. Dependency removal confirmed by a
clean `npm ci` followed by a production build.

Reachability after the pass: 4 unreached modules, each verified intentional (two are
side-effect imports the analyzer cannot follow; two are the retained items above).
