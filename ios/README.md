# Wireline (iOS)

Native iOS + CarPlay client for the Wireline AI call workspace. Wireline is
**agent-first**: it screens inbound calls, places outbound calls through Wireline
agents, is woken by VoIP push when a call arrives, and is driven by App Intents.
It is a thin client over the existing Wireline backend — no business logic,
prompts, model selection, or billing lives here. The phone is the daily control
surface for the agents.

> This folder is the iOS half of the Wireline monorepo. The backend it talks to
> is the same Express/Supabase app in the repo root; the mobile contract is
> `/api/mobile/*` (see `src/routes/mobile-routes.ts`).

## Product promise

Wireline should be instantly understandable:

> Wire your agent.

The native app is the everyday control surface: ask Wireline, check live calls,
review recaps, manage callback handoff, and keep the account activated across
Siri, widgets, and CallKit.

## Architecture

```text
ios/
├── project.yml                 XcodeGen spec → app + widget targets.
├── Wireline/
│   ├── WirelineApp.swift         App entry; sign-in gate; PushKit + URL routing.
│   ├── Info.plist               Background modes, usage strings, wireline:// scheme.
│   ├── Wireline.entitlements     aps-environment (CarPlay entitlement deferred).
│   ├── App/WirelineRouter.swift  Bridges App Intents / widgets → in-app surfaces.
│   ├── Theme/WirelineTheme.swift Native Wireline Letterpress tokens and system surfaces.
│   ├── Models/Models.swift      Codable mirrors of the /api/mobile/* payloads.
│   ├── Auth/AuthService.swift   Sign-in → JWT from session cookie → Keychain.
│   ├── Networking/              WirelineConfig, WirelineAPI (Bearer), KeychainStore.
│   ├── Calls/CallManager.swift  CallKit provider + PushKit (VoIP) registry.
│   ├── CarPlay/CarPlaySceneDelegate.swift  CarPlay Communication template.
│   ├── Device/DeviceActionHandler.swift  In-call actions: Maps / EventKit / Music.
│   ├── Intents/
│   │   ├── CallAgentIntent.swift   "Have an agent place a call."
│   │   └── WirelineIntents.swift     Ask / Summarize / Attention / Open + AppShortcuts.
│   ├── Components/BrandComponents.swift  AgentRow, CallCard, buttons.
│   └── Views/
│       ├── RootTabView.swift         Signed-in shell: Agents + Train + Wire.
│       ├── SignInView.swift / WorkspaceView.swift / OutboundCallView.swift
│       ├── CallsView.swift / CallDetailView.swift  Activity + per-call recap.
│       ├── AskWirelineView.swift      In-app "Ask Wireline" surface.
│       ├── SettingsView.swift        Callback number for "take this call".
│       └── ActivationSetupView.swift "Activate everywhere" setup screen.
└── WirelineWidgets/             WidgetKit extension for status and re-entry.
```

## Activation everywhere

The phone, not the car, is where most calls happen — so Wireline is reachable
across the whole iOS surface, all powered by **App Intents + App Shortcuts**:

| Entry point | How |
|---|---|
| **Siri** | "Ask Wireline", "…summarize my last call", "…what needs my attention". Auto-registered, zero setup. |
| **Action button** | User assigns the Ask Wireline shortcut in Settings. |
| **Back Tap** | User assigns a shortcut in Settings → Accessibility → Touch. |
| **Home / Lock Screen widget** | `WirelineWidgets` deep-links to `wireline://ask`. |
| **Control Center** | Deep-links via the same scheme. |
| **In-app** | The Ask Wireline button on the workspace. |
| **Apple Watch** | Planned. |

Honest constraint: apps cannot claim the Action button or Back Tap
programmatically — those are user choices in Settings. `ActivationSetupView`
walks the user through assigning them and links out to Settings / Shortcuts.

### How a call flows

**Inbound.** A caller reaches your Wireline number → provider webhook → the
backend's `/api/vapi-webhook` fires `notifyInboundCall` (`src/lib/apns-push.ts`)
→ APNs sends a **VoIP push** → `CallManager` receives it in
`pushRegistry(_:didReceive…)` and immediately calls `CXProvider.reportNewIncomingCall`.
iOS shows the native call UI on the phone and in CarPlay.

**Outbound.** "Hey Siri, tell Wireline to call the doctor, I'll be 5 minutes
late." → `CallAgentIntent` → `POST /api/mobile/calls/outbound`. The backend
builds the agent's dynamic system prompt server-side and dials through the
approved production voice provider; the app never sees prompt text.

## Auth

Bearer-token only. The app signs in via the existing `POST /api/auth/signin`,
stores the JWT in the Keychain, and sends `Authorization: Bearer <jwt>` on every
mobile request. The target contract is `/api/mobile/*`; native setup helpers use the mobile adapter for agent creation, setup, tool toggles, calls, wallet, devices, and handoff. Native requests carry no `Origin`/`Referer` and never send
cookies, so the surface is structurally not CSRF-reachable. Refresh via
`POST /api/auth/refresh`.

## Capabilities / entitlements

- **Push Notifications** + **Background Modes**: Voice over IP, Remote
  notifications, Audio, AirPlay.
- **CallKit** + **PushKit** (frameworks; PushKit VoIP requires a real device).
- **CarPlay**: request the **Communication (VoIP calling)** entitlement
  (`com.apple.developer.carplay-communication`) from Apple. This is the only
  CarPlay category Wireline qualifies for.
- **SiriKit / App Intents**, **EventKit** (calendar reminders), **MapKit**
  (directions deep-link), **MusicKit** / Spotify SDK (playback deep-link).

Bundle id: `com.wireline.app`. VoIP push topic: `com.wireline.app.voip`.

### Backend env (APNs)

The backend signs APNs tokens with these (see root `.env.example`):
`APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY` (the `.p8` contents), `APNS_BUNDLE_ID`,
`APNS_ENV`. Without them, push is a safe no-op and the rest of the platform is
unaffected.

## What's approvable vs aspirational

**Approvable / shipped intent:** CallKit inbound + outbound, the CarPlay
Communication template (recents/contacts/dialer), Siri + App Intents to place a
call, and deep-linking Maps / Spotify / Calendar.

**NOT possible:** controlling another app's CarPlay UI or widgets, custom
non-communication CarPlay templates, or driving Spotify's playback surface.
Wireline launches those apps; it does not pilot them.

## Roadmap

- **Phase 1 — done:** Bearer auth, `/api/mobile/me|agents|devices|calls`,
  outbound App Intent + the activation layer (Siri/widgets/Ask Wireline),
  CallKit + PushKit VoIP inbound, recap pushes, workspace, calls, and
  "take this call" handoff (`/api/mobile/calls/:id/handoff`).
- **Phase 2 — entitlement-gated:** CarPlay Communication scene
  (`CarPlay/CarPlaySceneDelegate.swift`) — call-back list + agents. Activates
  once Apple grants `carplay-communication`. Calls already appear in CarPlay's
  native UI via CallKit regardless.
- **Phase 3 — in progress:** in-call device actions — the agent can
  `navigate_to` / `add_reminder` / `play_music`, dispatched to the phone via
  push and executed by `Device/DeviceActionHandler`.

## Design

**Direction: native first, Wireline Letterpress second.** Wireline keeps SF Pro, system
materials, standard controls, CallKit surfaces, and App Intent behavior, then
layers the product identity on top: cool obsidian canvas `#0A0A0E`, surface panels
`#141319`, secondary surfaces `#100F15`, electric-violet primary action `#A78BFA`,
pressed action `#8B5CF6`, platinum-silver wire accent `#C7CCD6`, and primary ink `#F5F4F8`.

## Build

This repo commits a **XcodeGen** spec (`ios/project.yml`) instead of a checked-in
`.pbxproj`, so the project pins to your signing:

```bash
brew install xcodegen        # one-time
cd ios && xcodegen generate  # writes Wireline.xcodeproj
open Wireline.xcodeproj
```

Then set your Development Team in **Signing & Capabilities**, point
`WirelineAPI.baseURL` at your environment, and run on a **physical device**
(PushKit VoIP and CarPlay-on-device need real hardware; the CarPlay Simulator
covers UI only). The CarPlay Communication entitlement is deferred to Phase 2 —
see the note in `project.yml`.
