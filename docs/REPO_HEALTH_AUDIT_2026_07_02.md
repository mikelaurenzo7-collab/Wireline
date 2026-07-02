# Repo Health Audit - 2026-07-02

This snapshot records the strict health pass for PR #651 after Vercel and CodeRabbit cleared.

## Status

- Branch: `research/p0-operating-system`
- Pull request: #651
- Current purpose: turn research into measurable operating discipline and enforce the most important product contracts.
- Current check state at audit time: CodeRabbit success, Vercel `wireline` success, Vercel `v0-project` success.

## What improved in this pass

- Added a research operating system for launch confidence, activation, retention, expansion, pricing, growth, agent quality, reliability, UX, security posture, and developer experience.
- Linked the research operating system from the docs index.
- Added a typed product event taxonomy for activation, audience, surface, plan, account, agent, and correlation fields.
- Added product event contract tests.
- Added `npm run verify:contracts` for focused product voice, metadata, static metadata, and event taxonomy checks.
- Added a dedicated product-contracts workflow.
- Added a dedicated marketing e2e workflow for homepage story, accessibility, and audience-tab behavior.
- Hardened both new workflow trigger blocks and concurrency groups.
- Updated docs verification guidance to include the focused contract gate and marketing e2e command.

## Current repo health assessment

| Area | Status | Notes |
| --- | --- | --- |
| Product story | Strong | Canonical promise is `Wire your agent`; shared copy and metadata contracts reduce drift. |
| Static metadata | Strong | HTML, manifest, OG art, and metadata tests now cover the public crawler/share story. |
| Activation measurement | Improved | Event taxonomy exists; next step is instrumentation at the actual UI and server boundaries. |
| CI coverage | Improved | Focused contracts and marketing e2e have dedicated workflows. |
| Docs discoverability | Improved | Research and verification docs are linked from the docs index. |
| Landing copy | Minor debt | Two business-mode strings still over-index on call centers. Patch with a diff-capable editor. |
| Large-file maintainability | Watch | Avoid connector full-file rewrites for large React components; split when materially editing. |
| Launch readiness | Watch | Reliability probes, billing verification, and security-dashboard settings still need live operational checks. |

## Next surgical code patch

Patch `src/components/marketing/PrecisionLanding.tsx` locally or in an editor with diff support:

```diff
- role: "Call center agent",
+ role: "Business agent",

- note: "For call centers, sales teams, booking lines, support queues, and after-hours coverage.",
+ note: "For solo operators, business agents, booking lines, sales teams, support queues, and call centers.",
```

This is intentionally not forced through connector full-file replacement because the component is large and the desired change is only two strings.

## Recommended next gates before public push

1. Run `npm run verify:contracts`.
2. Run `npm run test:e2e` when runner capacity is available.
3. Verify production deploy status in Vercel.
4. Fetch the deployed homepage HTML and confirm the static title/description/social metadata match `Wire your agent`.
5. Verify signup intent, checkout start, phone provisioning start, test call, and first live-call events are emitted once instrumentation is wired.

## Merge posture

This PR is healthy for documentation, test contracts, and event taxonomy. It should be safe to merge after the current head remains green. The PR does not alter runtime product behavior except by adding shared event taxonomy code and new verification surfaces.
