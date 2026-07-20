# Wireline Repo Health Audit — 2026-07-04

**Status: historical.** First repo-health pass; superseded by the later
passes recorded in `CODEBASE_HEALTH.md`'s "Recent health actions" changelog.

## Scope

This pass reviewed repository health, durable documentation, active product boundaries, source-control hygiene, and obvious generated artifacts that do not belong in long-term source control.

The branch for this pass is `repo-health/docs-and-hygiene-pass`.

## Executive finding

Wireline is moving quickly and has strong source-of-truth modules for product copy, design tokens, pricing, video presenters, and runtime checks. The main repo-health risk is not lack of structure; it is **truth drift**: dated planning files, generated AI-review artifacts, and parallel language can make old plans look canonical.

The pass therefore focused on high-leverage hygiene:

1. Make the root README the repo front door.
2. Make `CODEBASE_HEALTH.md` the cleanup and deletion contract.
3. Make `docs/README.md` the canonical documentation index.
4. Align `ARCHITECTURE.md` with Create -> Train -> Wire -> Run, video presenters, browser, mobile, and ChatGPT surfaces.
5. Remove generated `.grok/artifacts` files from tracked source and prevent reintroduction.

## What changed

| Area | Action | Result |
| --- | --- | --- |
| Root docs | Refreshed `README.md` | Clear repo map, active product doctrine, verification commands, and hygiene contract. |
| Health rules | Rebuilt `CODEBASE_HEALTH.md` | Strong deletion rules, source-control boundaries, design discipline, and documentation taxonomy. |
| Architecture | Rebuilt `ARCHITECTURE.md` | Current product lanes, runtime services, data/security invariants, and source-of-truth discipline. |
| Docs index | Rebuilt `docs/README.md` | Canonical vs historical docs are separated; new durable docs must be linked there. |
| Git hygiene | Updated `.gitignore` | `.grok/artifacts/` and `.grok/tmp/` are ignored. |
| Generated artifacts | Removed tracked `.grok/artifacts` files visible in code search | Local AI-review/design artifacts no longer pretend to be source. |

## Files promoted as canonical

- `README.md`
- `CODEBASE_HEALTH.md`
- `ARCHITECTURE.md`
- `docs/README.md`
- `docs/business-usage-pricing-decision.md`
- `docs/CLIENT_SURFACES.md`
- `docs/CHATGPT_APP.md`
- `docs/GROK_LIVE_VOICE.md`
- `src/lib/product-copy.ts`
- `src/lib/plan-catalog.ts`
- `src/lib/video-presenter/copy.ts`
- `src/lib/wireline-design-vision.ts`

## Files and directories treated as non-durable

- `.grok/artifacts/**`
- `.grok/tmp/**`
- Local visual QA output
- Screenshots and one-off QA exports
- Generated review summaries and branch execution plans
- Temporary patch/reject/orig files
- Build, coverage, and Playwright output

## Current product doctrine

The repo should describe Wireline as one agent operating layer with four user-facing phases:

1. **Create** — short intake.
2. **Train** — deep agent configuration.
3. **Wire** — numbers, integrations, routing, approvals, billing, launch controls.
4. **Run** — Studio execution, calls, texts, follow-up, approvals, handoffs, and review.

Video presenters are part of the business-agent surface, but customer copy should remain Wireline-owned and vendor-neutral.

## Audit notes

### Strengths

- Strong verification scripts already exist in `package.json`.
- Product-copy source modules exist and should remain the first source for public and workspace language.
- Pricing model is documented and mirrored in a typed plan catalog.
- Video presenter support is encapsulated in a dedicated library and copy module.
- Browser extension posture is already privacy-conscious and explicit-action oriented.

### Risks

- Dated planning docs can look canonical when they are not indexed as historical.
- Generated AI-review files can accumulate and create noisy source-control history.
- Multiple surfaces are active enough that docs drift quickly unless ownership is explicit.
- Some old language, such as dashboard/operator/manager/control-center, can blur the product story.

### Follow-up priorities

1. Add a small CI or script check that fails when `.grok/artifacts`, `artifacts/`, `playwright-report/`, `coverage/`, or local screenshot output appears in tracked changes.
2. Review `docs/superpowers/**` and promote only durable decisions into canonical docs.
3. Search for thin `*-v2` wrappers and one-line migration exports, then delete or fold them into active modules.
4. Run a module-size report and split any overly large files by clear responsibility.
5. Re-run `npm run verify:full` before merge or production deployment.

## Verification status

This pass used connected GitHub inspection and targeted source edits. I did not run local `npm run verify` or `npm run verify:full` in this chat environment. Before merge, run:

```bash
npm run verify
npm run verify:full
node apps/browser-extension/scripts/build.mjs --check
```

## Merge recommendation

Merge after the generated artifact deletions and Markdown updates are reviewed. This branch is intentionally low runtime risk because it changes documentation and tracked artifact hygiene, not production application code.
