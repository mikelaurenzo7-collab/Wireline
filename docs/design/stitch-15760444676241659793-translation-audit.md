# Stitch 15760444676241659793 Translation Audit

_Last reviewed: June 22, 2026_

## Source of truth

- Stitch project: `https://stitch.withgoogle.com/projects/15760444676241659793`
- Latest attached handoff: `stitch_wireline_ai_communications_operating_system (4).zip`
- Canonical token file: `.stitch-export/DESIGN.md`
- Runtime token surfaces: `src/styles/foundation.css`, `ios/Wireline/Theme/WirelineTheme.swift`, `android/app/src/main/java/com/wireline/app/ui/theme/WirelineTheme.kt`, `ios/WirelineShared/WirelineWidgetSnapshot.swift`, and `android/app/src/main/java/com/wireline/app/widget/WidgetPalette.kt`
- Contract guard: `scripts/check-active-surface-drift.mjs`

## Non-negotiable translation rule

Stitch is a visual source, not the product contract. When generated screens drift into generic SaaS language, enterprise-only flows, or unsupported platform claims, production must translate the visual intent into Wireline's actual product:

- Wireline is a personal call and message assistant first.
- Business setup, CRM, team access, and commerce tools are optional expansion surfaces.
- Real pricing comes from `src/lib/plan-catalog.ts` and Stripe env contracts, not generated Stitch placeholder tiers.
- Real connected actions come from `src/lib/agent-capabilities.ts`, `src/lib/workspace-integration-catalog.ts`, and OAuth route support.
- Native mobile must remain native SwiftUI / Jetpack Compose; mobile Stitch mockups are references only.

## Visual system accepted from the new handoff

| Role | Production value |
| --- | --- |
| Canvas | `#F9F9FF` |
| Elevated card | `#FFFFFF` |
| Secondary surface | `#F0F3FF` |
| Raised well | `#E7EEFF` |
| Action | `#003EC7` |
| Pressed | `#0038B6` |
| Active container | `#DDE1FF` |
| Primary text | `#111C2D` |
| Secondary text | `#434656` |
| Border | `#C3C5D9` |
| Destructive | `#BA1A1A` |
| Type | Inter for web UI/display/body, JetBrains Mono for compact metadata; native system typography on iOS/Android |
| Geometry | 8px standard controls/cards/inputs, 16px large grouped containers, pills only for status/avatar use |

## Generated Stitch content that must be translated

| Stitch drift | Production translation |
| --- | --- |
| “Ametrine Purple,” `#5d3fd3`, Hanken Grotesk, purple marketing gradients | Use Wireline Precision / Signal Blue tokens from `.stitch-export/DESIGN.md`. Keep purple artifacts only as archived handoff evidence. |
| “The Intelligence Lifecycle,” “Build / Train / Run / Review,” “neural structures,” “edge deployment,” “99.99% uptime” | Translate to: request, knowledge, actions, recap, follow-up, active-call status. Do not claim unsupported uptime or model infrastructure. |
| “Global infrastructure leaders,” “enterprise teams,” “mission-critical serving” | Translate to personal jobs first: appointments, support lines, school/pharmacy, reservations, insurance, callbacks; business is optional. |
| “Agent Studio” as a primary nav label | Use “Studio” in navigation; “Agent Studio” can appear only in explanatory/admin contexts where necessary. |
| Generic pricing (`Personal $0`, `Business $49`, “5GB storage”) | Use `STRIPE_PLANS`: Everyday, Plus, Household, Concierge, Custom; include minutes, assistants, phone numbers, overages. |
| CRM-first “Sales Qualifier” defaults | Use personal assistant defaults first; expose sales/CRM as optional business tools in Connections/Actions. |
| App Store text: “Professional AI Agents,” “high-stakes professional environments” | Use “Your AI call assistant,” “Never wait on hold again,” and specific supported native capabilities. |
| App screenshots with unsupported reliability/compliance claims | Require real release-valid UI states, no mock reliability claims, no unsupported CarPlay/CallKit claims. |

## Implementation status

- Web shared tokens and component patterns are mapped to Wireline Precision and guarded by `npm run design:contract`.
- Workspace IA maps to Overview, Assistants, Studio, Knowledge, Connections, Inbox, and Settings.
- Public landing/pricing retain real consumer-first messaging and Stripe-backed pricing instead of generated placeholder plans.
- iOS, iOS widgets, Android, and Android widgets share Signal Blue palette translations while preserving native system behavior.
- The new Stitch export is committed as evidence, but generated purple/enterprise copy is not treated as runtime product copy.

## Release QA checklist

- Run `npm run design:contract` after every design-source update.
- Run `npm run lint` and `npm run build` before merging.
- Native release candidates must run simulator/device validation for SwiftUI, WidgetKit, Jetpack Compose, and Android widgets.
- App Store / Play Store screenshots must be generated from real UI states, not raw Stitch marketing prompts.
