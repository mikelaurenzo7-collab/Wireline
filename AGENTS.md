# Wireline Design Rules

## Current sources

- Google Stitch project: `https://stitch.withgoogle.com/projects/15464421841872665077`
- Latest production handoff: `stitch_wireline_operator_system (6).zip` — **Professional Heritage** visual system, source screens, native state references, and marketing assets.
- Desktop handoff maps to React web at desktop/laptop widths only.
- Mobile handoff maps to native SwiftUI iOS and Jetpack Compose Android only; it must not be recreated as mobile browser UI.
- Active shared tokens: `src/styles/foundation.css`, `ios/Wireline/Theme/WirelineTheme.swift`, and `android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt`.

Do not restore a Figma source, source bridge, preview route, design OAuth hook, no-code design authority, or the retired violet/lavender visual system.

## Product posture

Wireline is a personal call and message assistant first. It handles appointments, support lines, school or pharmacy calls, reservations, hold time, answers, and follow-ups. Business configuration is available, but it must be an optional expansion rather than the default story.

Use **assistant**, **your day**, **recap**, **follow-up**, **request**, **knowledge**, and **actions**. Avoid fleet, operator, command center, queue, SDR, telemetry, and Live Ops in primary product copy. When the Stitch handoff uses those legacy labels, map them to consumer equivalents:

| Stitch label | Wireline product label |
|---|---|
| Agent(s) / Fleet | Assistant(s) |
| Live Ops / Live Review | Recaps, active-call status, and follow-ups |
| Operator | You / account holder |
| Integrations | Actions (with connected accounts inside) |
| Handoff | Take call / callback |

## Shared visual system — Professional Heritage

- Warm canvas `#F9F9F7`; white elevated cards `#FFFFFF`; input/secondary surfaces `#F4F4F2`.
- Forest action and primary text `#1A3C34`; pressed state `#01261F`; active container `#E1E9E6`.
- Borders `#DADAD8`; secondary text `#4A5F59`; destructive `#BA1A1A`.
- Inter on web; platform system typography natively; mono only for compact metadata.
- 8px default cards, inputs, and standard buttons; 4px micro-controls; 12px sheets/modals. Pills only for status and avatars.
- Tonal layering before shadows. No violet, lavender, cyan, mesh, glass, gradients, or mascot treatment.
- 4px/8px rhythm; 0.98 press feedback for deliberate actions.

## Web rules

- Web is desktop/laptop-first. Standard QA: 1280×800 and 1440×900.
- Use the fixed 212px left navigation, `#F4F4F2` sidebar surface, fluid main stage, and optional 320px inspector.
- `/studio`, `/agents`, `/knowledge`, `/actions`, and `/settings` are canonical workspace destinations.
- `/ops` is only a backward-compatible redirect to Studio; never restore a primary real-time operations destination.
- Keep Studio above the fold: roster, training, and inspector must remain useful on laptop viewports.
- The latest Stitch desktop screens map as follows: homepage → public landing; agents → `/agents`; facts/rules → `/knowledge`; actions → `/actions`; training → `/studio`; settings → `/settings`; pricing/auth → public routes.

## Native rules

- iOS and Android use the mobile Stitch layouts as their visual source, not mobile-web layout.
- Native tabs map to Studio, Assistants, Knowledge, Actions, and Recaps. Recaps replaces retired live-operations screens.
- Preserve CallKit/App Intents/widgets/VoiceOver/Dynamic Type/safe areas on iOS.
- Preserve Material 3/Telecom/FCM/TalkBack/dynamic type/system insets on Android.
- The handoff's Smart Route, incoming-call, lock-screen, and CarPlay frames are behavior and high-glanceability references. They must preserve real phone-transfer, consent, and platform eligibility constraints.
- Do not trade real phone, push, billing, or device flows for decorative replica screens.

## Assets and marketing

- Use the latest handoff’s W-mark, App Store frames, social banner, and architecture artwork only where their rendered sizes and platform requirements are appropriate.
- App icons must be placed through platform-native asset catalogs with correct resize/crop QA; never use a marketing screenshot as an app icon.
- App Store and Play screenshots must contain real, release-valid UI states. Do not ship mock text or unsupported reliability/compliance claims.

## Implementation rules

1. Map through semantic tokens, never raw component colors.
2. Prefer `WorkspaceShell` for authenticated web pages.
3. Use Lucide on web, SF Symbols on iOS, and Material icons on Android.
4. Keep keyboard/focus states on web, focus-trap modals, and explicit accessible labels natively.
5. Treat phone provisioning, voice, models, agent config, connections, billing, consent, and device behavior as production contracts to preserve.
6. Run TypeScript/build validation and native simulator/device validation before release.
