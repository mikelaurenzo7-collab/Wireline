# Assistant (iOS)

Native iOS + CarPlay client for the Wireline AI voice-agent platform. Assistant is
voice-first for everyday people: ask it to call the doctor, pharmacy, restaurant,
school, landlord, airline, support line, family member, or local service with a
clear message; it can also screen inbound calls, wake for native call handling,
and run through Siri/App Intents. It is a thin client over the existing Wireline
backend — no business logic, prompts, model selection, or billing lives here.
The phone is a remote control for the fleet.

> This folder is the iOS half of the Wireline monorepo. The backend it talks to
> is the same Express/Supabase app in the repo root; the mobile contract is
> `/api/mobile/*` (see `src/routes/mobile-routes.ts`).

## Architecture

The source tree still uses the original Swift target and bundle identifiers for
now so Xcode signing, deep links, and backend topics do not break during the
product rename. User-facing copy should say **Assistant**. Internal symbol and
bundle renames should happen in a separate Xcode compile pass.

```text
ios/
├── project.yml                 XcodeGen spec → app + widget targets.
├── Wingman/                    Existing Swift app target, user-facing Assistant.
│   ├── WingmanApp.swift        App entry; sign-in gate; native call routing.
│   ├── Info.plist              Background modes, usage strings, URL scheme.
│   ├── Wingman.entitlements    Push entitlement; CarPlay entitlement deferred.
│   ├── Models/Models.swift     Codable mirrors of /api/mobile/* payloads.
│   ├── Auth/AuthService.swift  Sign-in → JWT from session cookie → Keychain.
│   ├── Networking/             Config, API client, KeychainStore.
│   ├── Calls/CallManager.swift CallKit provider + VoIP registry.
│   ├── CarPlay/                Communication template.
│   ├── Device/                 In-call actions: Maps / EventKit / Music.
│   ├── Intents/                Ask / call / recap / attention shortcuts.
│   ├── Components/             Reusable brand components.
│   └── Views/                  Home, Calls, Ask, Settings, Wallet.
└── WingmanWidgets/             Existing WidgetKit target, user-facing Assistant.
```

## Activation everywhere

The phone, not the car, is where most calls happen — so Assistant is reachable
across the whole iOS surface, powered by App Intents and App Shortcuts.

| Entry point | How |
|---|---|
| Siri | “Ask Assistant”, “take this call”, “summarize my last call”, “what needs my attention”. |
| Action button | User assigns the Ask Assistant shortcut in Settings. |
| Back Tap | User assigns a shortcut in Settings → Accessibility → Touch. |
| Home / Lock Screen widget | Widget opens the Ask Assistant surface. |
| Control Center | Deep-links to the same Ask surface. |
| In-app | The main Ask Assistant button on the workspace. |
| Apple Watch | Planned. |

Honest constraint: apps cannot claim the Action button or Back Tap
programmatically. The activation screen should guide the user through assigning
them and link out to Settings / Shortcuts. Self-contained intents such as
Summarize and What-needs-attention can speak answers back without launching the
app.

## How a call flows

**Inbound.** A caller reaches your Wireline number → Vapi → the backend webhook
fires `notifyInboundCall` → the mobile push layer wakes the signed-in device →
`CallManager` immediately reports the call through CallKit. iOS shows native call
UI on the phone and in CarPlay. Reporting immediately is mandatory for VoIP wake.

**Outbound.** “Hey Siri, ask Assistant to call the doctor; I’ll be 5 minutes
late.” → `CallAgentIntent` → `POST /api/mobile/calls/outbound`. The backend
builds the agent’s dynamic system prompt server-side and dials via Vapi; the app
never sees prompt text.

## Auth

Bearer-token only. The app signs in via the existing `POST /api/auth/signin`,
stores the JWT in the Keychain, and sends `Authorization: Bearer <jwt>` on every
`/api/mobile/*` call. Native requests carry no `Origin`/`Referer` and never send
cookies, so the surface is structurally not CSRF-reachable; the backend also
skip-lists `/api/mobile/` in `assertSameOrigin`. Refresh via
`POST /api/auth/refresh`.

## Capabilities / entitlements

- Push Notifications + Background Modes: Voice over IP, Remote notifications,
  Audio, AirPlay.
- CallKit + PushKit frameworks. VoIP wake requires a real device.
- CarPlay: request the Communication entitlement from Apple. Assistant qualifies
  only as a communication app.
- Siri/App Intents, EventKit, MapKit, and Music deep-link surfaces.

Current technical bundle id remains `com.wireline.wingman` until the Xcode rename
pass. User-facing product name is **Assistant**.

## Backend configuration

The backend already supports iOS APNs through `src/lib/apns-push.ts`. The product
plan is to centralize platform delivery behind `src/lib/mobile-push.ts` so iOS
APNs and Android FCM can share one import path. Android database support is
tracked by migration `0058_mobile_fcm_token.sql`.

Billing is read-only in the app. Credits are purchased on the web through Stripe;
the native app only displays wallet balance and recent ledger movement. This is
intentional to stay clear of Apple in-app purchase requirements.

## What is approvable vs aspirational

**Approvable / shipped intent:** CallKit inbound + outbound, CarPlay
Communication template, Siri/App Intents to place calls, tap-to-open recaps,
device actions that launch Maps/Music or write EventKit, and a read-only wallet.

**Not possible:** controlling another app’s CarPlay UI or widgets, custom
non-communication CarPlay templates, or driving Spotify/Music UI directly.
Assistant can launch those apps; it cannot pilot them.

## Roadmap

- Phase 1 — done: Bearer auth, `/api/mobile/me|agents|devices|calls`, outbound
  and take-this-call App Intents, activation layer, CallKit + PushKit inbound,
  recap delivery, Personal/Business workspace, Calls tab, handoff endpoint,
  device actions, and read-only wallet.
- Phase 2 — entitlement-gated: CarPlay Communication scene goes live when Apple
  grants the entitlement.
- Phase 3 — Android: native Kotlin + Compose client, FCM delivery, Telecom /
  ConnectionService, then Android Auto after phone reliability is proven.
- Phase 4 — cleanup: full internal Xcode target rename from the original Wingman
  symbols to Assistant after a clean compile pass.

## Design

Direction: iOS-native first, brand accent second. Assistant keeps SF Pro, system
materials, and standard controls, then layers Wireline’s Rich Cream + Purple
identity on top as the accent tint and cream surfaces. CallKit and CarPlay call
surfaces are system-rendered; Wireline contributes the app icon, accent tint, and
call labels.

## Build

This repo commits an XcodeGen spec instead of a checked-in `.pbxproj`, so the
project pins to your signing rather than ours:

```bash
brew install xcodegen
cd ios && xcodegen generate
open Wingman.xcodeproj
```

Then set your Development Team in Signing & Capabilities, point the native API
base URL at your environment, and run on a physical device.