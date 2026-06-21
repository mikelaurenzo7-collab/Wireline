# Professional Heritage v2 — Source-to-Product Map

This document records how the newest Google Stitch handoff is translated into the production Wireline monorepo.

## v7 audit result

`stitch_wireline_operator_system (7).zip` is **byte-for-byte identical** to v6 except for one additional file: `wireline_unified_execution_plan.md`. That guide reinforces the personal-assistant pivot, de-prioritizes Live from primary navigation, and elevates Smart Route / CarPlay work. It does not supersede the Professional Heritage token, typography, or fixed-screen source material.

## Source precedence

The handoff ZIP contains iterative artifacts from multiple generations. When they conflict, use this order:

1. `master_migration_engineering_blueprint_v2.0.md` for platform architecture, interaction, and hard token rules.
2. `professional_heritage/DESIGN.md` for final visual language, including **Source Serif 4** display/headline typography, **Work Sans** body/UI, and **JetBrains Mono** metadata.
3. The `*_fixed` screen families and current system-extension frames for composition, density, and device behavior.
4. The current production contracts in this repository.
5. Earlier Precision Operator / Calm Operator documents only when they describe a behavior not superseded above.

The latest handoff contains B2B/operator placeholder copy. Preserve its layout, density, palette, interactions, and device behavior, but map language to Wireline's consumer-first product posture.

| Handoff term | Wireline product term |
| --- | --- |
| Agent / Fleet | Assistant(s) |
| Operator | You / account holder |
| Live Ops / Live Review | Recaps, active-call status, and follow-ups |
| Integrations | Actions, with connected accounts inside |
| Handoff | Take call / callback |

## Inviolable system tokens

| Role | Token |
| --- | --- |
| Root surface | `#F9F9F7` |
| Raised surface | `#FFFFFF` |
| Input/sidebar surface | `#F4F4F2` |
| Divider/border | `#DADAD8` |
| Primary action/brand | `#1A3C34` |
| Pressed action | `#01261F` |
| Active container | `#E1E9E6` |
| Metadata | `#4A5F59` |
| Error | `#BA1A1A` |
| Cards/standard buttons/inputs | 8px radius |
| Micro-controls | 4px radius |
| Sheets/modals | 12px radius |

All deliberate interactive controls require a 200ms ease-out response to `0.98` scale while pressed.

## Web — desktop handoff mapping

Web is desktop/laptop-first. Do not reimplement the native mobile layouts in the browser.

| Latest Stitch screen | Production destination | Production implementation |
| --- | --- | --- |
| `homepage_never_wait_on_hold_again`, personal operator home variants | `/` | `src/components/marketing/PrecisionLanding.tsx` |
| `agents_fleet_roster_fixed`, empty/loading/degraded variations | `/agents` | `src/pages/AgentsPage.tsx` |
| `studio_agent_training_fixed`, create modal | `/studio` | `src/components/StudioWorkspaceV2.tsx`, `src/pages/AgentStudioHome.tsx` |
| `knowledge_facts_rules_fixed`, empty state | `/knowledge` | `src/components/KnowledgeWorkspace.tsx` |
| `actions_hub_fixed`, permissions/connections | `/actions` | `src/components/IntegrationsWorkspace.tsx` |
| `settings_workspace_admin_fixed` | `/settings` | `src/pages/SettingsPage.tsx` |
| `pricing_personal_pro_fixed` | `/pricing` | `src/pages/Pricing.tsx` |
| `auth_sign_in_fixed` | `/signin`, `/signup` | `src/components/AuthPortal.tsx` |

Required web shell: fixed 212px `#F4F4F2` sidebar, 64px header, 1680px maximum content width, active navigation with `#E1E9E6` and a 2px forest left rail.

## Native — iOS and Android handoff mapping

The mobile screen exports are native contracts only.

| Latest Stitch screen | Native job | Wireline destination |
| --- | --- | --- |
| `home_mobile_fixed` | Everyday command surface | Studio / Workspace |
| `studio_training_mobile_fixed` | Train a selected assistant | Studio |
| `agents_mobile_fixed` | Assistant roster | Assistants |
| `knowledge_mobile_fixed` | Facts, rules, and tone | Knowledge |
| `actions_hub_mobile_fixed` | Allowed capabilities/connections | Actions |
| `live_review_mobile`, `live_ops_mobile` | Active status and completed outcomes | Recaps |
| `settings_mobile_fixed` | Callback, account, privacy | Settings entry points |
| `pricing_mobile_fixed` | Plan selection | Web purchase path / native presentation as available |

Native primary navigation remains **Studio → Assistants → Knowledge → Actions → Recaps**. Studio is Wireline's consumer Home equivalent; Recaps intentionally replaces the retired Live Ops surface.

## System extensions and assets

| Latest source | Production mapping | Constraint |
| --- | --- | --- |
| `ios_smart_route_widget`, `ios_dynamic_island_smart_route` | `ios/WirelineWidgets/WirelineCallLiveActivity.swift` | Link only to factual, existing active-call controls |
| `active_call_lock_screen_widget_polish` | ActivityKit Lock Screen rendering | Display only actual server/app call state and optional actual transcript snippet |
| `carplay_*` frames | `ios/Wireline/CarPlay/CarPlaySceneDelegate.swift` | Communication templates only; no entitlement added until Apple approval |
| geometric W app icon assets | `src/components/brand/WirelineMark.tsx`, Android adaptive icon resources | Keep safe-zone sizing and never use a marketing screenshot as an app icon |
| App Store / Play marketing frames | Release capture plan | Capture release-valid UI; do not ship placeholder data or unsupported claims |

## Production protections

Never remove or bypass these production contracts to chase visual parity:

- agent ownership and authorization
- phone provisioning and callback validation
- billing/plan enforcement
- consent and DNC checks
- CallKit, PushKit, FCM, telecom, and platform eligibility behavior
- meaningful accessibility semantics, Dynamic Type, TalkBack, VoiceOver, keyboard focus, and reduced-motion behavior

## Validation matrix

- Web: build, typecheck/tests, and desktop screenshots at 1280×800 and 1440×900.
- iOS: simulator build plus physical-device validation for PushKit, CallKit, ActivityKit, widgets, Siri/App Intents, and callback handoff.
- Android: emulator/physical-device validation for Material3 behavior, FCM, Telecom, widgets, dynamic type, and TalkBack.
- CarPlay: only after Apple grants the Communication entitlement; verify CarPlay Simulator and a real head unit where possible.
