# Wireline Design Rules

## Current sources

- Google Stitch project: `https://stitch.withgoogle.com/projects/15760444676241659793`
- **Current production handoff:** `stitch_wireline_ai_communications_operating_system (4).zip` — Wireline Precision source screens, cross-platform blueprint, native state references, and brand/store assets.
- `wireline_unified_execution_plan.md` in that handoff establishes the personal-assistant IA and platform mapping. It does not override real product contracts or platform eligibility requirements.
- Desktop handoff maps to React web at desktop/laptop widths only.
- Mobile handoff maps to native SwiftUI iOS and Jetpack Compose Android only; it must not be recreated as mobile browser UI.
- Active shared tokens: `src/styles/foundation.css`, `ios/Wireline/Theme/WirelineTheme.swift`, and `android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt`.
- The automated source guard lives in `scripts/check-active-surface-drift.mjs`; keep it synchronized with the handoff instead of preserving a legacy design test.

Do not restore a Figma source, source bridge, preview route, design OAuth hook, no-code design authority, gray placeholder-only marketing panels.

## Product posture

Wireline is a personal call and message assistant first. It handles appointments, support lines, school or pharmacy calls, reservations, hold time, answers, and follow-ups. Business configuration is available, but it must be an optional expansion rather than the default story.

Use **assistant**, **your day**, **recap**, **follow-up**, **request**, **knowledge**, and **actions**. Avoid fleet, operator, command center, queue, SDR, telemetry, and Live Ops in primary product copy. When the Stitch handoff uses legacy labels, translate them:

| Stitch label | Wireline product label |
|---|---|
| Agent(s) / Fleet | Assistant(s) |
| Live Ops / Live Review | Recaps, active-call status, and follow-ups |
| Operator | You / account holder |
| Integrations | Actions (with connected accounts inside) |
| Handoff | Take this call / callback |

## Shared visual system — Ametrine Precision

- Signal-purple workspace canvas `#F8F9FF`; elevated card `#FFFFFF`; input/secondary surface `#EFF4FF` (surface-container-low); raised well `#E5EEFF` (surface-container).
- Ametrine Purple action `#5D3FD3` (primary-container) or `#451EBB` (primary); pressed state `#451EBB`; active container `#E6DEFF` (primary-fixed); primary text `#0B1C30`.
- Borders/outlines `#C9C4D7` (outline-variant); secondary text `#484554`; destructive `#BA1A1A`.
- Hanken Grotesk for web display headings; Inter for body copy; platform system typography natively; JetBrains Mono for compact metadata and code-like labels.
- `-0.02em` on display/headline hierarchy; `cv05`, `cv08`, and `ss01` for web headings.
- 4px (`0.25rem`) default input/control corners; 8px (`0.5rem`) for standard cards and buttons; 12px (`0.75rem`) for larger modals or panels. Pills only for status and avatars.
- Tonal layering before shadows. No forest-heritage palette, legacy signal blue, cyan, mesh, glass, decorative gradients, or mascot treatment.
- Base-4 spacing rhythm. Deliberate interactive controls use 200ms `0.98` press feedback.

## Web rules

- Web is desktop/laptop-first. Standard QA: 1280×800 and 1440×900.
- Use the fixed 256px left navigation, `#F0F3FF` sidebar surface, fluid main stage, and optional 320px inspector.
- `/studio`, `/agents`, `/knowledge`, `/actions`, and `/settings` are canonical workspace destinations.
- `/ops` is only a backward-compatible redirect to Studio; never restore a primary real-time operations destination.
- Keep Studio above the fold: roster, training, and inspector must remain useful on laptop viewports.
- The latest source mapping: homepage → public landing; agents → `/agents`; facts/rules → `/knowledge`; actions → `/actions`; training → `/studio`; settings → `/settings`; pricing/auth → public routes.
- Every public product visual must show a comprehensible user job, work-in-progress state, or outcome. Do not ship inert skeleton bars as explanatory product imagery.

## Native rules

- iOS and Android use the mobile Stitch layouts as their visual source, not mobile-web layout.
- Native tabs map to Studio, Assistants, Knowledge, Actions, and Recaps. Recaps replaces retired live-operations screens.
- Preserve CallKit/App Intents/widgets/VoiceOver/Dynamic Type/safe areas on iOS.
- Preserve Material 3/Telecom/FCM/TalkBack/dynamic type/system insets on Android.
- Smart Route, incoming-call, lock-screen, and CarPlay frames are behavior and high-glanceability references. They must preserve real phone-transfer, consent, and platform eligibility constraints.
- Do not trade real phone, push, billing, or device flows for decorative replica screens.

## Assets and marketing

- Use the handoff’s W-mark, App Store frames, social banner, and architecture artwork only where rendered size and platform requirements are appropriate.
- App icons must be placed through platform-native asset catalogs with correct resize/crop QA; never use a marketing screenshot as an app icon.
- App Store and Play screenshots must contain real, release-valid UI states. Do not ship mock text or unsupported reliability/compliance claims.

## Implementation rules

1. Map through semantic tokens, never raw component colors.
2. Prefer `WorkspaceShell` for authenticated web pages.
3. Use Lucide on web, SF Symbols on iOS, and Material icons on Android.
4. Keep keyboard/focus states on web, focus-trap modals, and explicit accessible labels natively.
5. Treat phone provisioning, voice, models, agent config, connections, billing, consent, and device behavior as production contracts to preserve.
6. Run `npm run design:contract`, TypeScript/build validation, and native simulator/device validation before release.
