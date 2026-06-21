# Stitch v6 — Professional Heritage Source-to-Product Mapping

This document records the implementation decisions for the latest `stitch_wireline_operator_system (6).zip` handoff. It prevents a future UI pass from treating every generated operator screen as a literal product requirement.

## Authority and precedence

1. The latest Stitch v6 **fixed** screens and `master_migration_engineering_blueprint_v2.0.md` define visual tokens, density, geometry, and interaction behavior.
2. Wireline’s production contracts define what can be presented as real: owned-agent configuration, phone provisioning, billing, consent, call state, handoff, widgets, CallKit, Telecom, push, and platform entitlements.
3. Consumer-first positioning governs copy and information architecture. A generated B2B operation label is translated instead of copied when it misrepresents Wireline’s product.

## Universal implementation contract

| Contract | Value |
|---|---|
| Root surface | `#F9F9F7` |
| Primary text/action | `#1A3C34` |
| Secondary surface | `#F4F4F2` |
| Borders/dividers | `#DADAD8` |
| Secondary copy | `#4A5F59` |
| Standard card/input/button radius | `8px` / `8pt` / `8dp` |
| Press feedback | 200ms, scale to `0.98` |
| Desktop shell | fixed `212px` workspace sidebar, fluid content capped at `1680px` |
| Native shell | five primary jobs: Studio, Assistants, Knowledge, Actions, Recaps |

## Terminology translation

| Generated source term | Wireline product term | Reason |
|---|---|---|
| Agent / Fleet | Assistant(s) | Personal assistance is the primary product story. |
| Live Ops / monitoring | Recaps, active call, follow-ups | The user should understand what is happening without entering an operator console. |
| Operator | You / account holder | Avoids B2B control-room framing. |
| Integrations | Actions | Starts with what the assistant can do; connected accounts are supporting detail. |
| Handoff | Take this call / callback | Plain language for a real phone-transfer action. |
| Confidence score / uptime | Omitted unless backed by a real server metric | Do not render invented reliability telemetry. |

## Desktop web mapping

| Stitch v6 source | Canonical Wireline surface | Implementation note |
|---|---|---|
| `studio_agent_training_fixed` | `/studio` | Three-pane desktop training workspace; roster, conversation, and inspector remain above the fold. |
| `agents_fleet_roster_fixed`, empty/loading/degraded variants | `/agents` | Assistant roster; state variants must use real owned-agent data, not seeded metrics. |
| `knowledge_facts_rules_fixed` | `/knowledge` | Facts, boundaries, and voice/tone map to persisted agent config. |
| `actions_hub_fixed` | `/actions` | Consumer permissions and connected accounts first; business tools remain optional. |
| `settings_workspace_admin_fixed` | `/settings` | Plan, phone/callback, voice, privacy, and connection settings. |
| `pricing_personal_pro_fixed` | `/pricing` | Consumer acquisition copy and current Stripe plan catalog remain authoritative. |
| `auth_sign_in_fixed` | `/signin`, `/signup` | Use real authentication and OAuth routes. |
| `homepage_*` and `features_*` | public landing/features routes | “Never wait on hold again” is compatible with consumer positioning. |

## Native iOS and Android mapping

| Stitch v6 source | Native job | Production mapping |
|---|---|---|
| `home_mobile_fixed` | Studio / your day | Ask Wireline, current calls, follow-ups, assistants, wallet, and activation remain real mobile actions. |
| `agents_mobile_fixed` | Assistants | Native owned-assistant list and creation flow. |
| `knowledge_mobile_fixed` | Knowledge | Facts and guardrails stored through the same agent-config endpoints as web. |
| `actions_hub_mobile_fixed` | Actions | Persisted enabled-tool selection and connected-action visibility. |
| `live_review_mobile`, `live_ops_mobile` | Recaps | Active-call status and completed call recaps; not a separate live-operations product. |
| `settings_mobile_fixed` | Settings | Callback number, account controls, and native device setup. |
| `pricing_mobile_fixed`, sign-in variants | mobile onboarding/acquisition | Use only release-valid product/billing states. |

## System-extension mapping

| Stitch v6 source | Implementation | Constraint |
|---|---|---|
| `incoming_call_ai_handling_state` | iOS `LiveCallView` | Presents actual caller/service, server call status, elapsed time, and real handoff action. |
| `ios_smart_route_widget`, `ios_dynamic_island_smart_route` | ActivityKit `WirelineCallLiveActivity` | Starts after CallKit answer and routes to in-app call controls. Push-driven transcript updates require a future Live Activity token delivery path. |
| `active_call_lock_screen_widget_polish` | Live Activity / existing WidgetKit surfaces | A transcript is only shown when genuine transcript data exists; no placeholder conversation is shipped. |
| `carplay_*` | `CarPlaySceneDelegate` + CallKit | CarPlay Communication entitlement is Apple-gated. Driver-safe call state and callbacks remain the supported scope. |
| premium app icon / touch icon / favicon | Android adaptive icon and web mark | iOS Asset Catalog variants require final exported files and device crop QA before App Store submission. |

## Explicit non-mappings

- Do not recreate Live Ops, quality-review dashboards, fake confidence scores, fake session volume, or a separate B2B fleet console as primary consumer navigation.
- Do not turn native mobile frames into responsive web pages.
- Do not use marketing screenshots as live app UI or app-store submission screenshots.
- Do not claim transfer, transcript, uptime, compliance, or platform entitlement behavior that is not implemented and verified.

## Release gates

1. Web: TypeScript, tests, production build, and 1280×800 / 1440×900 visual review.
2. iOS: XcodeGen, simulator compile, real device call/PushKit/Live Activity pass, widget/Lock Screen pass, and entitlement review for CarPlay.
3. Android: Gradle build, real-device Telecom and FCM validation, widget rendering pass, and accessibility pass.
4. Store assets: physical-device screenshots in the exact final UI state, plus App Store / Play Store metadata review.
