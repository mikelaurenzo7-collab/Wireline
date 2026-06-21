# Wireline Design Rules

## Current sources

- Google Stitch project: `https://stitch.withgoogle.com/projects/15464421841872665077`
- Current desktop handoff: React web app, desktop/laptop only.
- Current mobile handoff: native SwiftUI iOS and Jetpack Compose Android only.
- Active shared tokens: `src/styles/foundation.css`, `ios/Wireline/Theme/WirelineTheme.swift`, and `android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt`.

Do not restore a Figma source, source bridge, preview route, design OAuth hook, or no-code design authority.

## Product posture

Wireline is a personal call and message assistant first. It handles appointments, support lines, school or pharmacy calls, reservations, hold time, answers, and follow-ups. Business configuration is available, but it must be an optional expansion rather than the default story.

Use **assistant**, **your day**, **recap**, **follow-up**, **request**, **knowledge**, and **connections**. Avoid fleet, operator, command center, queue, SDR, telemetry, and Live Ops in primary product copy.

## Shared visual system

- Warm canvas `#F9F9F7`; white cards; quiet warm borders.
- Forest action `#1A3C34`; pressed state `#01261F`.
- Inter on web; platform system typography natively; mono only for compact metadata.
- 4px default controls, 8px grouped cards, 12px sheets/modals. Pills only for status and avatars.
- Tonal layering before shadows. No violet, lavender, cyan, mesh, glass, gradients, or mascot treatment.
- 4px/8px rhythm; 0.98 press feedback for deliberate actions.

## Web rules

- Web is desktop/laptop-first. Standard QA: 1280×800 and 1440×900.
- Use the fixed 212px left navigation, fluid main stage, and optional 320px inspector.
- `/studio`, `/agents`, `/knowledge`, `/actions`, and `/settings` are canonical workspace destinations.
- `/ops` is only a backward-compatible redirect to Studio; never restore a primary real-time operations destination.
- Keep Studio above the fold: roster, training, and inspector must remain useful on laptop viewports.

## Native rules

- iOS and Android use the mobile Stitch layout as their visual source, not mobile-web layout.
- Native tabs map to Studio, Assistants, Knowledge, Actions, and Recaps. Recaps replaces the retired live-operations concept.
- Preserve CallKit/App Intents/widgets/VoiceOver/Dynamic Type/safe areas on iOS.
- Preserve Material 3/Telecom/FCM/TalkBack/dynamic type/system insets on Android.
- Do not trade real phone, push, billing, or device flows for decorative replica screens.

## Implementation rules

1. Map through semantic tokens, never raw component colors.
2. Prefer `WorkspaceShell` for authenticated web pages.
3. Use Lucide on web, SF Symbols on iOS, and Material icons on Android.
4. Keep keyboard/focus states on web and explicit accessible labels natively.
5. Treat phone provisioning, voice, models, agent config, connections, billing, consent, and device behavior as production contracts to preserve.
6. Run TypeScript/build validation and native simulator/device validation before release.
