# Wireline iOS

Native SwiftUI client for the Wireline mobile API. **Product posture: Planned** until signing, physical-device acceptance, privacy review, TestFlight, and App Store review are complete. CarPlay Communication is entitlement-gated Phase 2, not a current customer surface.

Wireline is agent-first: it screens inbound calls, places explicit user-initiated outbound calls through Wireline agents, wakes through VoIP push when a call arrives, and exposes focused App Intents. The app is a thin client over the root Express/Supabase backend. Provider selection, prompts, billing, entitlement, compliance, and tenant enforcement remain server-owned.

> The backend contract is `/api/mobile/*`; see `src/routes/mobile-routes.ts`.

## Product promise

> Wire your agent.

The native app is the everyday control surface: ask Wireline, check live calls, review recaps, manage callback handoff, and re-enter work through Siri, widgets, and CallKit. Personal and business agents share the same backend contract without forcing one audience into the other's language.

## Architecture

```text
ios/
├── project.yml                    XcodeGen spec for app and widget targets
├── Wireline/
│   ├── WirelineApp.swift          App entry, sign-in gate, PushKit, URL routing
│   ├── Info.plist                 Background modes, usage strings, URL scheme
│   ├── Wireline.entitlements      Push/App Group; CarPlay entitlement deferred
│   ├── App/WirelineRouter.swift   Intents and widget deep links to app surfaces
│   ├── Theme/WirelineTheme.swift  Native Wireline Letterpress tokens
│   ├── Models/Models.swift        Codable `/api/mobile/*` payloads
│   ├── Auth/AuthService.swift     Sign-in, Keychain, auth recovery
│   ├── Networking/                Base URL, Bearer API, Keychain store
│   ├── Calls/CallManager.swift    CallKit provider and PushKit registry
│   ├── CarPlay/                   Entitlement-gated Communication templates
│   ├── Device/                    Maps, EventKit, and media handoff actions
│   ├── Intents/                   Call, Ask, recap, attention, and open intents
│   ├── Widgets/WidgetSync.swift   App-side widget snapshot refresh
│   └── Views/                     Signed-in native product surfaces
├── WirelineShared/                Types shared by app and widget targets
└── WirelineWidgets/               WidgetKit snapshot renderers
```

## Authentication and account recovery

Bearer-token only. The app signs in through `POST /api/auth/signin`, stores the session JWT in Keychain, and sends `Authorization: Bearer <jwt>` on mobile requests. Native requests do not rely on browser cookies.

- Refresh through `POST /api/auth/refresh` when the session contract permits it.
- An unusable token must clear local authenticated state and return to sign-in.
- Settings must expose sign-out and the implemented account-deletion path.
- Billing and Runtime Balance top-ups remain web-owned; iOS may display read-only usage and balance state.

## Activation everywhere

Wireline uses App Intents and App Shortcuts as explicit entry points:

| Entry point | Behavior |
| --- | --- |
| Siri | Ask Wireline, place a bounded call, summarize the last call, or surface attention items. |
| Shortcuts app | User-configured automations built from small, explicit intents. |
| Action button | User assigns an Ask Wireline shortcut in Settings. The app cannot claim the hardware button. |
| Back Tap | User assigns a shortcut through Accessibility settings. |
| Home / Lock Screen widget | Deep-links into Ask Wireline, Calls, or a supported detail surface. |
| Control Center | User-added shortcut or control that reuses the same deep-link contract. |
| Spotlight | App Shortcut discovery and standard app re-entry. |
| CarPlay | Communication-only callbacks, live handoff, and agent-line visibility after entitlement approval. |

### Shortcut guardrails

- Every outbound call is explicitly user-initiated; background automations must not place surprise calls.
- Confirm actions that may create costs, bookings, cancellations, or legal, medical, or financial commitments.
- Never present Wireline as emergency calling or a replacement for 911 or local emergency services.
- Siri, Lock Screen, widgets, and CarPlay keep output short and privacy-preserving; longer detail opens in the app.
- Device and contact resolution must reuse the same backend consent, DNC, entitlement, and spend gates as the app.

## Call flow

**Inbound:** a caller reaches a Wireline number, the backend receives the provider webhook, `src/lib/apns-push.ts` emits a VoIP push, and `CallManager` immediately reports the call through CallKit. iOS owns native presentation; the backend owns call identity and authorization.

**Outbound:** an App Intent or in-app action calls `POST /api/mobile/calls/outbound`. The backend builds the selected agent's instructions, verifies purpose and consent, applies DNC, entitlement, and spend controls, then dials through the approved production voice path. The app never receives provider credentials or prompt text.

## Widgets

The widget extension has no independent authentication or network client. The signed-in app fetches bounded `/api/mobile/*` data and writes a small snapshot into the shared App Group. WidgetKit only renders that snapshot.

Current snapshot-backed surfaces include recent calls, needs-attention count, and read-only Runtime Balance. Widgets must degrade cleanly for signed-out, empty, stale, and error states. Top-ups, CRM setup, campaign management, and long-form Training do not belong in widgets.

Interactive widgets or Live Activities may add explicit callback or handoff actions only after a narrow server endpoint exists and the action passes the same purpose, consent, authorization, and spend controls as the app.

## Capabilities and entitlements

- Push Notifications and Background Modes for Voice over IP, remote notifications, and active-call audio.
- CallKit and PushKit; VoIP behavior requires physical-device acceptance.
- App Groups for app-to-widget snapshots.
- Siri and App Intents.
- EventKit, MapKit deep links, and supported media handoff for explicit device actions.
- CarPlay Communication entitlement only after Apple grants `com.apple.developer.carplay-communication`.

Bundle ID: `com.wireline.app`. Widget bundle ID: `com.wireline.app.widgets`. VoIP push topic: `com.wireline.app.voip`.

Backend APNs configuration is defined in root `.env.example`: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY`, `APNS_BUNDLE_ID`, and `APNS_ENV`. Missing push configuration must degrade safely without exposing credentials or breaking unrelated web/API behavior.

## CarPlay boundary

CarPlay is a low-distraction Communication surface only. Allowed behavior is limited to active-call routing, recent callbacks, one-tap handoff, agent-line identity, and concise empty/error states. Do not add free-form AI chat, long recaps, Training, settings, billing, Runtime Balance, analytics, onboarding, admin controls, marketing, or control of another app's CarPlay UI.

Calls may appear in the system CarPlay call UI through CallKit even before a branded CarPlay entitlement is granted. The custom CarPlay scene remains disabled from signed builds until approval.

## Design

Native first, Wireline Letterpress second. Keep SF Pro, system materials, standard controls, CallKit surfaces, accessibility behavior, and App Intent conventions. Apply the shared product identity through cool obsidian `#0A0A0E`, surface `#141319`, secondary surface `#100F15`, electric-violet action `#A78BFA`, pressed action `#8B5CF6`, platinum-silver accent `#C7CCD6`, and primary ink `#F5F4F8`.

Do not reintroduce retired palettes, generic dashboard language, or non-native control behavior.

## Build and signing

App Store Connect uploads require Xcode 26 or newer and the iOS 26 SDK or later. The repository commits `ios/project.yml` rather than a generated `.pbxproj`.

```bash
brew install xcodegen        # one-time
cd ios && xcodegen generate
open Wireline.xcodeproj
```

Then:

1. Set the Development Team on the app and widget targets.
2. Confirm bundle identifiers match Apple Developer portal records.
3. Create and select the App Group used by both targets.
4. Point `WirelineConfig.baseURL` at the intended production or approved test environment.
5. Exercise PushKit, CallKit, widgets, handoff, and optional CarPlay UI on physical hardware where required.

## Release checklist

- Agents, Training, Wire, Inbox, Calls, and empty states use current product language and routes.
- Sign-in, token refresh, auth recovery, sign-out, and account deletion are reachable.
- Widgets and intents deep-link into current routes and never display placeholder account data.
- Marketing outbound requires the same explicit consent evidence as the web/API path.
- Usage descriptions and Privacy Nutrition Labels match behavior actually shipped.
- Demo review account contains bounded seeded data and does not require production secrets or manual approval.
- PushKit reports incoming calls promptly and CallKit owns native call presentation.
- The CarPlay entitlement is absent until Apple grants it.
- TestFlight acceptance covers sign-in, outbound call, VoIP inbound call, callback handoff, Siri/App Intents, and widgets on a physical device.

## Related documentation

- [iOS App Store and CarPlay readiness](../docs/IOS_APP_STORE_CARPLAY_READINESS.md)
- [Client surface boundaries](../docs/CLIENT_SURFACES.md)
- [Multi-surface QA](../docs/MULTI_SURFACE_QA_2026-07-07.md)
- [Production voice runtime policy](../docs/PRODUCTION_VOICE_RUNTIME_POLICY_2026-07-26.md)
