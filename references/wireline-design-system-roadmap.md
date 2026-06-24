# Wireline Design System Operating Plan

## Product reality

Wireline is not a generic SaaS dashboard. It is a conversation operating system for personal and business assistants across **voice, email, text, inboxes, integrations, and agent configuration**. The design system therefore prioritizes operational clarity, trusted automation, and cross-surface continuity over decorative novelty.

The active web application already uses React 19, Vite, Tailwind v4, Radix primitives, CVA, Motion, Vitest, Playwright, and Vercel. These remain the web baseline. This program explicitly does **not** require a Next.js rewrite, a new UI kit, or a separate design-system monorepo before product work can continue.

## Design principles

1. **Conversations are the product.** Every surface must make it obvious who is acting, what an assistant knows, what it will do, and what happened.
2. **Automation is reviewable.** Suggested and completed AI actions expose status, scope, source, approval state, and result.
3. **Operator-grade without enterprise clutter.** Dense information is allowed when hierarchy, metadata, and action priority remain explicit.
4. **Mobile is a first-class operating surface.** A mobile route cannot be a desktop layout compressed into a narrow viewport. Navigation, actions, composer flows, and status surfaces have named mobile presentations.
5. **One semantic decision, many platform expressions.** Tokens describe roles, not hex values or device-specific layouts.
6. **Truthful interfaces only.** A control cannot look saved, active, synced, or configurable unless the underlying persistence/runtime contract exists.

## Current architecture

```text
DTCG-style JSON source
  -> generated CSS custom properties
  -> generated typed TypeScript values
  -> existing Tailwind v4 + CSS runtime
  -> canonical atoms / molecules / organisms
  -> product routes and client surfaces
```

The initial token source is `design-tokens/wireline.tokens.json`. The dependency-free generator emits web artifacts today. The same semantic paths are the future contract for SwiftUI, Jetpack Compose, extension surfaces, and widgets.

## Canonical web stack

| Concern | Wireline decision |
| --- | --- |
| App runtime | React 19 + Vite |
| Styling | Tailwind CSS v4 plus semantic CSS custom properties |
| Accessible primitives | Radix UI |
| Component variants | CVA |
| Motion | Motion, with global reduced-motion handling |
| Visual semantics | Atomic Design atoms, molecules, and organisms |
| Component tests | Vitest contracts plus consumer adoption tests |
| E2E / mobile viewport QA | Playwright and existing visual QA tooling |
| Deployment | Vercel previews and production builds |

## Component system priorities

### Tier 1 — foundational, shipping now

- Semantic tokens: canvas, surface, text, action, border, status, space, radius, motion, typography.
- Atoms: Button, Input, Textarea, NativeSelect, Switch, Badge, Skeleton, EmptyState, Toast, Dialog, Tooltip.
- Molecules: FormField, SearchField, StatusNotice, MetricCard, Card.
- Organisms: PageShell, CommandBar, WorkspaceShell navigation and mobile overlay presentations.
- Required interaction states: default, hover, pressed, focus-visible, disabled, loading, empty, success, warning, error.

### Tier 2 — conversation operating system

- Assistant identity and readiness card.
- Conversation row and conversation detail layout.
- Transcript message, participant identity, tool activity, source/citation, approval request, and outcome receipt.
- Composer with attachment, channel selection, draft/sending/failure states, and desktop/mobile layouts.
- Agent scope and permissions surface: what an assistant can access, act on, and escalate.

### Tier 3 — operational workflows

- Connection health and OAuth lifecycle panels.
- Knowledge source ingestion and sync status.
- Call, email, and SMS activity timelines.
- Search, filter, bulk selection, and list-detail layouts.
- Billing, credit, and usage guardrails that distinguish estimated from charged activity.

## AI interaction contract

Every AI-initiated surface should answer four questions in the visible UI:

1. **What is being proposed or performed?**
2. **What information or instruction informed it?**
3. **Does the user need to approve it?**
4. **What was the outcome or failure state?**

This yields a consistent state model:

```text
idle -> drafting -> awaiting approval -> executing -> completed
                               |                 |
                               -> declined       -> failed / retryable
```

Use a distinct status treatment for assistant reasoning summaries, tool execution, approval gates, and persisted outcomes. Never expose internal chain-of-thought; show concise, user-relevant rationale and sources instead.

## Surface strategy

### Web app and public site

Keep the current Vite/React architecture. Public navigation uses the `navigation` Dialog presentation; workspace navigation uses `sidebar`; compact page actions use `drawer`. New blocking mobile surfaces must select a named Dialog presentation rather than reproduce focus, scroll locking, or z-index behavior locally.

### Browser extension / ChatGPT-like client surface

Reuse typed tokens and web atoms, but maintain a constrained extension shell: compact popups for inspection, side panels for task workflows, minimal permissions, and explicit data-access disclosure. Do not assume the full workspace shell fits host surfaces.

### iOS and Android

Do not force a shared React Native runtime before the product has demonstrated a need. Export semantic token adapters first, then build thin native components with SwiftUI and Jetpack Compose. Keep interaction vocabulary aligned—same statuses, hierarchy, approval semantics, and spacing roles—while respecting platform-native navigation and controls.

### Widgets

Widgets are glanceable status and action-entry surfaces, not compressed app screens. Initial widget candidates: assistant readiness, latest conversation outcome, today’s scheduled actions, and high-priority approval requests. Widget content must degrade gracefully by available size.

## Roadmap

### Phase A — harden the live web system

- Complete generated token coverage for existing CSS roles.
- Add token change checks to design contracts and visual QA.
- Finish workflow-dialog audit: confirmations, destructive actions, and command surfaces.
- Add Playwright viewport coverage at 375px, 390px, 768px, 1024px, and 1440px for public navigation, workspace sidebar, drawers, Inbox, Studio, and Settings.

### Phase B — conversation patterns

- Standardize transcript, tool activity, approval, citation, and outcome components.
- Define channel-aware composer behavior for voice, text, and email.
- Add clear saved/saving/failed/pending language to all agent and connection controls.

### Phase C — platform adapters

- Generate Swift and Kotlin token artifacts from the same DTCG source.
- Map tokens to SwiftUI environment values and Compose theme roles.
- Establish WidgetKit and Glance component constraints.
- Create an extension shell package after the web component contracts stabilize.

### Phase D — system operations

- Storybook or an equivalent component catalog for atoms, molecules, organisms, and critical conversation patterns.
- Screenshot/visual regression pipeline for high-traffic pages and overlay states.
- Changelog, token versioning, deprecation rules, and component RFC template.

## Non-goals

- No framework rewrite for its own sake.
- No dependency on a generic full-stack UI library that fights Wireline branding.
- No token migration that changes product behavior without a consumer adoption and visual verification in the same change.
- No native component abstraction until the semantic token contract is proven on web.

## Definition of success

The system is successful when a user can move between the public site, workspace, assistant setup, inbox, voice/email/text activity, mobile overlays, and future native/extension surfaces without relearning hierarchy, status meaning, or action behavior—and when engineering can change a semantic decision once and verify its consumer impact before it reaches production.
