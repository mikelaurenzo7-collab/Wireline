# Design Source Audit and Cross-Surface Execution Plan

## Purpose

This document is the operating plan for translating the new design source material into the existing Wireline platform without creating a second product, inventing unsupported claims, or weakening the server-owned platform boundary.

The source package is a visual and interaction-direction reference. It is not a literal implementation specification.

## Source audit

### Source families observed

1. **Midnight operations workspace**
   - Near-black canvas with quiet surface separation.
   - A compact left rail, controlled top bar, a prompt-first assistant workroom, proposal/approval cards, and a contextual right rail or canvas.
   - Accent is restrained: blue for action and information hierarchy, teal for live/healthy state, amber only for attention.
   - The visual hierarchy is compositional rather than decorative: one dominant task, one supporting status area, then secondary operational context.

2. **Editorial public and personal-product source**
   - Warm paper canvas, dark ink, forest-green emphasis, high-contrast serif display, dense but calm component rhythm.
   - Strong reference value for marketing hierarchy, short benefit framing, pricing-card restraint, authentication composition, and human-readable activity logs.
   - It is not a product-positioning source of truth: several pages frame Wireline as only a personal phone agent and include unsupported plan prices, minute caps, unlimited claims, and phone-specific integration statements.

### Translation decisions

- **Adopt** the midnight operational language for Studio and future operator-heavy views: Studio, agent review, inbox triage, run/approval state, and possibly enterprise live operations.
- **Preserve** the existing light/public system for marketing, pricing, legal, trust, and authentication. Bring across its editorial restraint and clear hierarchy rather than its literal typography or fixed desktop geometry.
- **Do not adopt literally** source product claims, pricing, provider references, fictional agent metrics, or channel limitations. Wireline remains a multi-channel assistant platform for voice, text, and email under user-approved workflows.
- **Do not force one color mode across every surface.** Public acquisition, secure account entry, and high-focus operational work have different cognitive requirements. The shared constants are density, hierarchy, containment, touch ergonomics, and truthful state.

## Current implementation audit

### Already aligned

- The web workspace has a dedicated shell, desktop rail, mobile drawer, keyboard skip link, content rail, and route-aware Studio treatment.
- Studio now has a scoped midnight operations layer, including responsive containment, tablet rail recomposition, input zoom protection, and desktop work-area limits.
- The client ownership model is documented: web configures and launches; iOS/Android handle approved native communication experiences; browser extension is a companion; the ChatGPT App remains account-bound and draft-only.

### Gaps that remain

1. **Source-to-runtime drift is still possible.** The platform needs explicit cross-surface visual contracts rather than one-off route CSS.
2. **Legacy detailed Studio modes** should be normalized to the same information density and containment model before new visual motifs are spread to other areas.
3. **Tablet behavior needs first-class acceptance tests.** A desktop rail collapsing to a drawer is not sufficient for 768–1024px flows.
4. **Mobile action hierarchy** needs route-by-route validation: long labels, two-action headers, chips, message composer, and safe-area behavior.
5. **Native and embedded clients need platform-native translation, not copied web screens.** iOS must remain SwiftUI, Android must remain Compose, and the ChatGPT App and browser extension must respect their narrower contexts.

## Canonical cross-surface rules

### Shared behavior rules

- Every text-bearing action must either have a bounded label span with `min-width: 0` and truncation/wrapping behavior, or intentionally recompose at the small breakpoint.
- Icon-only controls must have an accessible name and an effective 44px target where the platform permits.
- A high-focus flow has one primary action per view. Secondary actions become menus, tabs, or contextual controls—not a horizontal overflow row.
- Tablet is a distinct composition: retain context while converting wide sidebars into compact rails, segmented controls, or lower-page support modules.
- Composition can vary by platform; data, state names, permissions, activity semantics, and approval vocabulary must remain consistent.

### Visual primitives to standardize

- Canvas: public paper / secured neutral / focused midnight.
- Surface: one base card, one inset field, one emphasis panel. Avoid indiscriminate nested cards.
- Status: healthy/live, needs review, blocked/failed, neutral/draft.
- Task card: context, concise outcome, impact/risk note, explicit approved action.
- Activity row: actor/channel, outcome, time, status, expansion path.
- Composer: persistent, safe-area aware, visible submit state, no keyboard overlap.

## Execution sequence

### Phase 0 — Audit gates and regression contract (now)

1. Add this source audit and make it the translation policy.
2. Inventory web screens that participate in Studio, Inbox, Assistants, Settings, billing, auth, and public acquisition.
3. Build a viewport matrix: 320, 360, 375, 390, 430, 640, 768, 834, 1024, 1280, 1366, and 1440px.
4. Add route-level visual/interaction acceptance scenarios before large new surface work.

**Adjustment gate:** If an intended source translation requires global token overrides, duplicated client state, or breaks an existing keyboard/approval flow, stop and redesign the translation at the component boundary rather than layering more route-specific CSS.

### Phase 1 — Web platform completion

1. Normalize legacy detailed Studio modes into the existing Studio operations vocabulary.
2. Tighten WorkspaceShell and top-level route headers for 320–430px action containment and 768–1024px contextual navigation.
3. Rework Inbox and activity surfaces around concise activity rows, inspectable outcomes, and action state—not visual card density.
4. Bring Assistants and onboarding into one explicit lifecycle: intent, configuration, knowledge/context, test, approval, launch, monitor.
5. Apply public-source editorial restraint to marketing, pricing, and authentication while preserving the current multi-channel strategy and live Stripe product truth.

**Adjustment gate:** If usability decreases in a real task flow (setup, message triage, agent approval, billing), retain the original workflow structure and only move visual primitives. Source fidelity never overrides task completion.

### Phase 2 — iOS

- Preserve native SwiftUI information architecture.
- Prioritize Today, Live Call, Recent Activity, Assistant controls, and widget/Live Activity states.
- Translate the midnight operational system to native materials, Dynamic Type, safe areas, haptics, and standard navigation—not CSS-like cards.
- Validate compact iPhone, large iPhone, landscape, iPad split view, full-width iPad, widget families, and CarPlay surfaces.

**Adjustment gate:** Any web-derived interaction that fights iOS navigation, Dynamic Type, CallKit, widget timelines, or App Store expectations is replaced with native behavior while retaining shared vocabulary and server contracts.

### Phase 3 — Android

- Preserve Kotlin/Compose and Material-adaptive navigation.
- Prioritize Home, live/notification state, inbox/action review, assistant status, widget, and Android Auto-safe communication flows.
- Validate small phones, large phones, foldable/narrow multi-window behavior, tablets, and system font scaling.

**Adjustment gate:** Android uses native composition and accessibility semantics rather than a visual clone of iOS or web. Shared intent and status language remains mandatory.

### Phase 4 — ChatGPT App

- Keep the app account-bound, draft-only, and consent-forward.
- Translate the source into a narrow-panel interaction model: context header, short output, proposal card, safe preview, explicit handoff into Wireline.
- Validate compact ChatGPT panel width, widget availability/fallbacks, long assistant outputs, empty state, OAuth interruption, and error/retry state.

**Adjustment gate:** If a design needs broad workspace navigation or persistent operational control, move the action to Wireline web/mobile and keep the ChatGPT surface as a directed handoff.

### Phase 5 — Browser extension

- Keep the extension a companion: page/selection handoff, compose aid, and clearly scoped contextual capture.
- Translate into a compact side panel/popup with a visible source context, concise prompt, destination assistant, confirmation, and status receipt.
- Validate 320px side-panel width, popup dimensions, keyboard-only navigation, permission-empty state, page errors, offline state, and browser store constraints.

**Adjustment gate:** If a capability needs long-running extraction, autonomous browsing, hidden analysis, or independent external action, it remains server-reviewed or is excluded from the extension.

## Release and quality gates

### Web

- Build, typecheck, route smoke, keyboard navigation, mobile viewport checks, no horizontal overflow at the viewport matrix, and Vercel deployment inspection.

### Native

- iOS: XcodeGen, simulator build, Dynamic Type, physical-device CallKit/PushKit/widget acceptance.
- Android: Gradle compile, emulator smoke, font-scale/layout-direction checks, physical-device Telecom/FCM/widget acceptance.

### Embedded clients

- ChatGPT App: discovery, OAuth/PKCE reviewer path, draft-only boundary, error/fallback.
- Browser extension: manifest policy, artifact build, Chrome/Edge acceptance smoke, side-panel/popup keyboard checks.

### Decision protocol

Every phase closes with one of three outcomes:

1. **Advance** — interaction and layout acceptance criteria pass.
2. **Constrain** — keep the visual direction but narrow it to the screens where it improves task completion.
3. **Rework** — revert the translation at the component boundary and choose a simpler platform-native composition.

No phase expands to the next client solely because it looks coherent in screenshots.
