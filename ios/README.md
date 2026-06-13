# Wingman (iOS)

Native iOS + CarPlay client for the Wireline AI voice agent platform. Wingman is
**voice-first**: it screens inbound calls and places outbound calls through your
Wireline agents, is woken by VoIP push when a call arrives, and is driven by
"Hey Siri, tell Wingman to…" App Intents. It is a thin client over the existing
Wireline backend — no business logic, prompts, model selection, or billing lives
here. The phone is a remote control for the fleet.

> This folder is the iOS half of the Wireline monorepo. The backend it talks to
> is the same Express/Supabase app in the repo root; the mobile contract is
> `/api/mobile/*` (see `src/routes/mobile-routes.ts`).

## Architecture

```
ios/Wingman/
├── WingmanApp.swift            App entry; registers PushKit + CallKit on launch.
├── Models/Models.swift         Codable mirrors of the /api/mobile/* payloads.
├── Networking/
│   ├── WingmanAPI.swift        Bearer-auth REST client for /api/mobile/*.
│   └── KeychainStore.swift     JWT storage (kSecAttrAccessibleAfterFirstUnlock).
├── Calls/CallManager.swift     CallKit provider + PushKit (VoIP) registry.
├── Intents/CallAgentIntent.swift  App Intents: place / (Phase 2) delegate a call.
└── Views/WorkspaceView.swift   SwiftUI: Personal vs Business workspace.
```

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
Communication template (recents/contacts/dialer), Siri + App Intents to place a
call, and deep-linking Maps / Spotify / Calendar (open the other app at the right
place).

**NOT possible (don't promise it):** controlling another app's CarPlay UI or
widgets, custom non-communication CarPlay templates, or driving Spotify's
playback surface. Wingman *launches* those apps; it does not pilot them. Apple
restricts CarPlay template categories and Wingman is a communication app.

## Roadmap

- **Phase 1 (this scaffold + backend):** Bearer auth, `/api/mobile/me|agents|devices`,
  outbound App Intent, CallKit + PushKit VoIP inbound, Personal/Business workspace.
- **Phase 2:** CarPlay Communication template; `DelegateCallIntent`
  ("have him take this call") + backend `/api/mobile/calls/:id/delegate`.
- **Phase 3:** in-call tool dispatch (Maps/Spotify/Calendar via alert push),
  optional low-latency WebSocket channel, prepaid credit wallet UI.

## Build

Open `Wingman.xcodeproj` in Xcode 16+, set your team + bundle id, point
`WingmanAPI.baseURL` at your environment, and run on a physical device (PushKit
VoIP and CarPlay-on-device need real hardware; the CarPlay Simulator covers UI).
The Xcode project file is intentionally not committed yet — generate it from
these sources (File → New → App, then add the files) or via XcodeGen using a
`project.yml`, so the project pins to your team/signing rather than ours.
