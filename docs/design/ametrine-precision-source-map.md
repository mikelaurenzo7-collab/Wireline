# Ametrine Precision — Source-to-Product Map

This document is the current design authority for Wireline. It maps the `stitch_wireline_ai_communications_operating_system` export into production Web, iOS, Android, widgets, and CarPlay surfaces.

## Product posture

Wireline is one communications product with two legitimate modes:

- **Personal:** a private communications assistant for calls, messages, scheduling, follow-up, and everyday coordination.
- **Business:** branded assistants for reception, sales qualification, customer service, booking, and customer handoff.

Personal clarity remains the default. Business capability is additive; it must not turn primary navigation into a call-center or surveillance console.

## Visual authority

| Role | Ametrine Precision token |
| --- | --- |
| Root surface | `#F8F9FF` |
| Raised surface | `#FFFFFF` |
| Secondary surface | `#EFF4FF` |
| Container surface | `#E5EEFF` |
| Divider | `#C9C4D7` |
| Primary text | `#0B1C30` |
| Secondary text | `#484554` |
| Primary action | `#5D3FD3` |
| Pressed action | `#4B32B3` |
| Deep action | `#451EBB` |
| Active container | `#E6DEFF` |
| Default control radius | `4px` |
| Standard card radius | `8px` |

Typography:

- Hanken Grotesk for display and headings.
- Inter for dense body and application copy.
- JetBrains Mono for metadata and technical labels.

All deliberate interactive controls retain 200ms ease-out feedback to `0.98` scale while pressed. Use low-contrast borders and restrained purple shadows; do not use gradients as structural decoration.

## Canonical web information architecture

1. Overview
2. Assistants
3. Agent Studio
4. Knowledge
5. Connections
6. Inbox
7. Settings

### Mapping

| Stitch surface | Production route | Production responsibility |
| --- | --- | --- |
| Workspace Overview | `/overview` | Real assistant state, useful next steps, connections, and activity entry points. Never invent metrics. |
| Assistants Directory | `/agents` | Personal and business assistants, lifecycle status, role, channels, and readiness from real data. |
| Agent Studio | `/studio` | Identity, business context, channels, actions, safety, test, and launch through progressively disclosed configuration. |
| Knowledge Base | `/knowledge` | Workspace facts, agent-specific guidance, source freshness, conflicts, and ingestion health. |
| Connections & Actions | `/actions` | OAuth/connected accounts, scopes, health, and agent permissions. |
| Inbox & Activity | `/inbox` | Real email, call, SMS, handoff, and follow-up outcomes. |
| Settings | `/settings` | Identity, privacy, callback, plan, workspace preferences, and business profile defaults. |

## Personal and business behavior

- A personal account may create multiple assistants; it stays private by default.
- A business account may brand assistants, connect CRM/calendar tools, define business hours, and route customer handoffs.
- Shared business memberships and role-aware access are an engineering program, not a visual claim. Until authorization is complete, do not imply collaborative workspace access.
- Do not use "Fleet" or "Live Ops" as primary navigation. Use Assistants, Inbox, Handoffs, and Activity.

## Native mapping

### iOS

- Overview, Inbox, Assistants, and Settings are mobile-first jobs.
- Dynamic Island and Live Activity show only real active-call status, handoff controls, and actual transcript snippets.
- Widgets expose factual coverage, pending handoffs, and a safe quick action.
- CarPlay remains a narrow Communication surface: active screening, recent callbacks, and user-initiated take-over.

### Android

- Material 3 stays native under the Ametrine palette.
- Widgets show coverage, active assistants, and urgent handoffs using real snapshots.
- Rich notifications expose only safe, user-actionable lead, handoff, and call states.

## Non-negotiable protections

Do not remove or bypass authorization, billing, webhooks, consent/DNC, callback validation, accessibility, reduced-motion behavior, telecom eligibility, CallKit/PushKit/FCM behavior, or native platform entitlement gates to achieve visual parity.

## Validation

- Web: `npm run verify:full`, Ametrine contract check, and desktop screenshot QA at 1280×800 and 1440×900.
- iOS: simulator compile plus physical-device checks for sign-in, push, CallKit, widgets, App Intents, and callback handoff.
- Android: Gradle build plus device/emulator checks for FCM, widgets, typography scale, and TalkBack.
- CarPlay: only after Apple grants the Communication entitlement.
