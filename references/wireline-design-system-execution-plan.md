# Wireline Design System Execution Plan

## Product decision

Wireline is a conversation operating system, not a generic dashboard. Every surface must make three things clear: **who is acting**, **what authority exists**, and **what happened**.

The current web stack remains the implementation baseline: React 19, Vite, Tailwind CSS v4, Radix, CVA, Motion, Vitest, Playwright, and Vercel. Wireline will not add a framework rewrite, a second primitive system, a generic UI kit, or a premature monorepo migration.

## Interaction constitution

1. **Semantic roles, not aesthetic aliases.** Tokens define canvas, surface, text, action, focus, feedback, overlay, elevation, space, radius, typography, and motion roles.
2. **Automation is reviewable.** A user can see what is proposed or performed, the scope and authority involved, whether approval is required, and the outcome or recovery path.
3. **Conversation is a shared operating pattern.** Email, SMS, voice, extension activity, mobile task history, and future ChatGPT-app outputs share participant, channel, timestamp, state, source/permission, and outcome semantics.
4. **Density is deliberate.** Operational detail is welcome only when hierarchy, metadata, and action priority remain scannable.
5. **Mobile is an operating mode.** Compact layouts use routes, drawers, and named overlays rather than compressed desktop screens.

## Visible AI lifecycle

```text
idle -> drafting -> awaiting approval -> executing -> completed
                       -> declined        -> failed / retryable
```

Never present internal chain-of-thought. Show concise rationale, scope, sources, permissions, and results.

## Execution sequence

### Track A — semantic foundation

1. Put interaction, feedback, focus, overlay, and elevation values in the DTCG source.
2. Generate CSS and TypeScript artifacts and require their contract in verification.
3. Make the CSS runtime consume generated semantic values instead of duplicated literals.

### Track B — trusted AI workflows

1. Standardize approval requests, tool activity, source disclosure, and outcome receipts.
2. Adopt those patterns in active Actions and Director workflows.
3. Consolidate legacy per-agent capability surfaces behind the active Actions contract.
4. Extract Call Logs transcript detail before migrating it to shared transcript primitives.

### Track C — adaptive quality

1. Establish critical viewport contracts at 375, 390, 768, 1024, and 1440 pixels.
2. Add Playwright and Axe coverage for navigation, Inbox, Studio, Actions, Settings, approval states, and mobile overlays.
3. Use screenshot baselines only for stable workflows; visual regression supplements semantic assertions.

### Track D — platform adapters

1. Generate Swift and Kotlin token artifacts after web roles are proven.
2. Share status and hierarchy semantics across SwiftUI, Compose, widgets, extension side panels, and ChatGPT-app surfaces without copying web layout.

## Merge standard

A design-system slice may merge only when the underlying data/persistence contract stays truthful, critical lifecycle states are visible, keyboard and screen-reader behavior is preserved or improved, new states use semantic tokens, contracts and builds pass, and the reviewed preview is ready or its completed build is documented.

## Definition of elite

Wireline is elite when users understand what an assistant knows, may do, is doing, and did across voice, email, text, mobile, extensions, and native surfaces without learning a different operating language on each screen.