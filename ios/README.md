# Wingman (iOS)

Native iOS + CarPlay client for the Wireline AI voice agent platform. Wingman is
**voice-first for everyday people**: ask it to call the doctor, pharmacy, restaurant, school, landlord, airline, support line, family member, or local service with a clear message; it can also screen inbound calls, wake from VoIP push, and run through "Hey Siri, tell Wingman to…" App Intents. It is a thin client over the existing
Wireline backend — no business logic, prompts, model selection, or billing lives
here. The phone is a remote control for the fleet.

> This folder is the iOS half of the Wireline monorepo. The backend it talks to
> is the same Express/Supabase app in the repo root; the mobile contract is
> `/api/mobile/*` (see `src/routes/mobile-routes.ts`).

## Architecture

```
ios/
├── project.yml                 XcodeGen spec → app + widget targets.
├── Wingman/
│   ├── WingmanApp.swift         App entry; sign-in gate; PushKit + URL routing.
│   ├── Info.plist               Background modes, usage strings, wingman:// scheme.
│   ├── Wingman.entitlements     aps-environment (CarPlay entitlement deferred).
│   ├── App/WingmanRouter.swift  Bridges App Intents / widgets → in-app surfaces.
│   ├── Theme/WingmanTheme.swift Brand tokens (purple/cream) + .wingmanBrand().
│   ├── Models/Models.swift      Codable mirrors of the /api/mobile/* payloads.
│   ├── Auth/AuthService.swift   Sign-in → JWT from session cookie → Keychain.
│   ├── Networking/              WingmanConfig, WingmanAPI (Bearer), KeychainStore.
│   ├── Calls/CallManager.swift  CallKit provider + PushKit (VoIP) registry.
│   ├── CarPlay/CarPlaySceneDelegate.swift  CarPlay Communication template.
│   ├── Device/DeviceActionHandler.swift  In-call actions: Maps / EventKit / Music.
│   ├── Intents/
│   │   ├── CallAgentIntent.swift   "Have an agent place a call."
│   │   └── WingmanIntents.swift     Ask / Take this / Summarize / Attention / Open + AppShortcuts.
│   ├── Components/BrandComponents.swift  Medallion, AgentRow, CallCard, buttons.
│   └── Views/
│       ├── RootTabView.swift         Signed-in shell: Home + Calls tabs.
│       ├── SignInView.swift / WorkspaceView.swift / OutboundCallView.swift
│       ├── CallsView.swift / CallDetailView.swift  Activity + per-call recap.
│       ├── AskWingmanView.swift      In-app "Ask Wingman" surface.
│       ├── SettingsView.swift        Callback number for "take this call".
│       └── ActivationSetupView.swift "Activate everywhere" setup screen.
└── WingmanWidgets/             WidgetKit extension (Home/Lock-screen "Ask Wingman").
```

## Activation everywhere (the off-CarPlay layer)

The phone, not the car, is where most calls happen — so Wingman is reachable
across the whole iOS surface, all powered by **App Intents + App Shortcuts**:

| Entry point | How |
|---|---|
| **Siri** | "Ask Wingman", "…take this call", "…summarize my last call", "…what needs my attention". Auto-registered, zero setup. |
| **Action button** (15 Pro+) | User assigns the *Ask Wingman* shortcut in Settings. |
| **Back Tap** | User assigns a shortcut in Settings → Accessibility → Touch. |
| **Home / Lock Screen widget** | `WingmanWidgets` deep-links to `wingman://ask`. |
| **Control Center** | Deep-links via the same scheme. |
| **In-app** | The big "Ask Wingman" button on the workspace. |
| **Apple Watch** | Planned. |

Honest constraint: apps **cannot** claim the Action button or Back Tap
programmatically — those are user choices in Settings. `ActivationSetupView`
walks the user through assigning them and links out to Settings / Shortcuts.
The fully self-contained intents (Summarize, What-needs-attention) speak their
answer back without launching the app.

### How a call flows

**Inbound.** A caller reaches your Wireline number → Vapi → the backend's
`/api/vapi-webhook` fires `notifyInboundCall` (`src/lib/apns-push.ts`) → APNs
sends a **VoIP push** → `CallManager` receives it in `pushRegistry(_:didReceive…)`
and **immediately** calls `CXProvider.reportNewIncomingCall`. iOS shows the
native call UI on the phone and in CarPlay. (Reporting immediately is mandatory:
iOS terminates an app that takes a VoIP push without reporting a call.)

**Outbound.** "Hey Siri, tell Wingman to call the doctor, I'll be 5 minutes
late." → `CallAgentIntent` → `POST /api/mobile/calls/outbound`. The backend
builds the agent's dynamic system prompt server-side and dials via Vapi; the app
never sees prompt text.

## Auth

Bearer-token only. The app signs in via the existing `POST /api/auth/signin`,
stores the JWT in the Keychain, and sends `Authorization: Bearer <jwt>` on every
`/api/mobile/*` call. Native requests carry no `Origin`/`Referer` and never send
cookies, so the surface is structurally not CSRF-reachable (the backend also
skip-lists `/api/mobile/` in `assertSameOrigin`). Refresh via `POST /api/auth/refresh`.

## Capabilities / entitlements (Xcode → Signing & Capabilities)

- **Push Notifications** + **Background Modes**: Voice over IP, Remote
  notifications, Audio, AirPlay.
- **CallKit** + **PushKit** (frameworks; PushKit VoIP requires a real device).
- **CarPlay**: request the **Communication (VoIP calling)** entitlement
  (`com.apple.developer.carplay-communication`) from Apple. This is the only
  CarPlay category Wingman qualifies for.
- **SiriKit / App Intents**, **EventKit** (calendar reminders), **MapKit**
  (directions deep-link), **MusicKit** / Spotify SDK (playback deep-link).

Bundle id: `com.wireline.wingman`. VoIP push topic: `com.wireline.wingman.voip`.

### Backend env (APNs)

The backend signs APNs tokens with these (see root `.env.example`):
`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY` (the `.p8` contents), `APNS_BUNDLE_ID`,
`APNS_ENV`. Without them, push is a safe no-op and the rest of the platform is
unaffected.

## What's approvable vs aspirational (be honest)

**Approvable / shipped intent:** CallKit inbound + outbound, the CarPlay
Communication template (live ops active-call handoff, recents, agents), Siri + App Intents to place a
call, and deep-linking Maps / Spotify / Calendar (open the other app at the right
place).

**NOT possible (don't promise it):** controlling another app's CarPlay UI or
widgets, custom non-communication CarPlay templates, or driving Spotify's
playback surface. Wingman *launches* those apps; it does not pilot them. Apple
restricts CarPlay template categories and Wingman is a communication app.

## Roadmap

- **Phase 1 — done:** Bearer auth, `/api/mobile/me|agents|devices|calls`,
  outbound and take-this-call App Intents + the full activation layer (Siri/widgets/Ask Wingman),
  CallKit + PushKit VoIP inbound, recap pushes, Personal/Business workspace,
  Calls tab, and "take this call" handoff (`/api/mobile/calls/:id/handoff`).
- **Phase 2 — in code, gated on entitlement:** CarPlay Communication scene
  (`CarPlay/CarPlaySceneDelegate.swift`) — live ops handoff, call-back list, business workspace, and agents. Activates
  once Apple grants `carplay-communication`. (Calls already appear in CarPlay's
  native UI via CallKit regardless.)
- **Phase 3 — started:** in-call **device actions** shipped — the agent can
  `navigate_to` / `add_reminder` / `play_music`, dispatched to the phone via
  push and executed by `Device/DeviceActionHandler` (opens Maps / writes
  EventKit / opens Music). Opt-in per agent, never on a customer-facing role.
  Remaining: optional low-latency WebSocket channel, prepaid credit wallet UI.

## Design

**Direction: iOS-native first, brand accent second.** Wingman keeps SF Pro,
system materials, and standard controls — best HIG fit and the smoothest App
Store review — and layers Wireline's "Rich Cream + Purple" identity on top as
the accent tint (`#8B3FD6`) and cream surfaces (`#F5F1E8`). `Theme/WingmanTheme.swift`
holds the tokens, mirrored from the web's `src/index.css`; apply them with
`.tint(Brand.purple)` and the `.wingmanBrand()` view modifier. The CallKit and
CarPlay call surfaces are system-rendered (Apple's, not themeable) — we only
contribute the app icon, accent tint, and call labels there.

## Everyday shortcuts, App Store + CarPlay readiness

Start with [EVERYDAY_SHORTCUTS_PLAN.md](./EVERYDAY_SHORTCUTS_PLAN.md) for the consumer-first Siri, Shortcuts, widgets, Action button, Back Tap, Control Center, Spotlight, CarPlay, and future Apple Watch plan. Then use [APP_STORE_CARPLAY_READINESS.md](./APP_STORE_CARPLAY_READINESS.md) for the submission plan, CarPlay entitlement packet, App Review notes template, intent inventory, screenshot set, and release blockers.

## Build

This repo commits a **XcodeGen** spec (`ios/project.yml`) instead of a checked-in
`.pbxproj`, so the project pins to *your* signing rather than ours:

```bash
brew install xcodegen        # one-time
cd ios && xcodegen generate  # writes Wingman.xcodeproj
open Wingman.xcodeproj
```

Then set your Development Team in **Signing & Capabilities**, point
`WingmanAPI.baseURL` at your environment, and run on a **physical device**
(PushKit VoIP and CarPlay-on-device need real hardware; the CarPlay Simulator
covers UI only). The CarPlay Communication entitlement is deferred to Phase 2 —
see the note in `project.yml`.
