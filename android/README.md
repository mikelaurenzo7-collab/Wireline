# Wireline Android

Native Kotlin + Jetpack Compose client for the Wireline mobile API.

The Android app is the everyday control surface for Wireline agents:

- Sign in through `POST /api/auth/signin`, then reuse the `wireline_session` JWT as `Authorization: Bearer` on `/api/mobile/*`.
- Register a Firebase Cloud Messaging token with `POST /api/mobile/devices`.
- Ask Wireline to place a call, review call updates and recaps, manage callback handoff, and check usage balance.
- Present inbound Wireline calls through Android Telecom as a self-managed `ConnectionService`.
- Dispatch supported in-call device actions to Maps, Calendar, or media search.

## Product promise

> Wire your agent.

The native product is the daily control surface for agents, calls, recaps, and follow-up. Business and personal workflows use the same backend agent configuration, but the language must stay clear, practical, and agent-forward.

## Design contract

The Google Stitch project contains two implementation tracks:

- **Desktop web deliverables** map to the React web application.
- **Native mobile deliverables map to both this Compose app and the SwiftUI iOS app.** They are not mobile-web layouts.

Android follows Wireline Letterpress (Aurora palette) while remaining Material-native:

- cool obsidian canvas `#0A0A0E`, surface cards `#141319`, secondary surfaces `#100F15`, and primary ink `#F5F4F8`
- electric-violet primary action `#A78BFA`, pressed state `#8B5CF6`, platinum-silver wire accent `#C7CCD6`, and semantic status colors only where status is required
- compact controls, restrained radius, and a clear 4dp/8dp spacing rhythm
- no legacy forest-green/copper Letterpress palette, signal blue, cyan, mesh, or decorative gradients
- agent language: agents, calls, texts, recaps, and follow-up—not Live Ops or operator dashboards
- retain Material 3, TalkBack labels, dynamic font scaling, Android system insets, notification permission, and Telecom behavior

## Build

Open the `android/` folder in Android Studio and let it sync the Gradle project. The project targets API 35.

Before a real-device build:

1. Create a Firebase Android app with package `com.wireline.app`.
2. Download `google-services.json` and place it at `android/app/google-services.json`.
3. Confirm Vercel has `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` for Production, Preview, and Development.
4. Update `BuildConfig.WIRELINE_BASE_URL` in `android/app/build.gradle.kts` to point at a preview or local tunnel if needed.
5. Validate push and Telecom behavior on a physical phone.

The Google Services Gradle plugin is applied only when `google-services.json` exists, so source sync works before Firebase credentials are available.

## Call integration

Inbound FCM data messages with `type=incoming_call` call `TelecomManager.addNewIncomingCall`. Answering the native Android call UI calls `POST /api/mobile/calls/:callId/handoff`, which transfers the live call to the callback number saved in Settings.

Android Auto compatibility comes through the system Telecom surface. A branded Android Auto communication experience still depends on platform eligibility and review, but the phone/car calling primitive is native.

## Backend contract

The app intentionally stays thin. The server owns:

- outbound consent and DNC gates
- agent prompt construction
- plan and balance enforcement
- live-call transfer
- push fan-out and stale-token pruning

See `src/routes/mobile-routes.ts`, `src/lib/mobile-push.ts`, and `src/lib/fcm-push.ts` for backend behavior.

## Grok realtime voice

Native apps support authenticated Grok realtime voice sessions for live tests with role-tuned, distinctive personalities. Production voice remains on the approved production voice provider until the product and compliance posture justify a change. See `docs/GROK_LIVE_VOICE.md` and `grok-voice-config.ts`.
