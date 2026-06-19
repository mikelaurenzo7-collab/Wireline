# Wireline Android

Native Kotlin + Jetpack Compose client for the Wireline mobile API.

The Android app mirrors the iOS consumer/operator surface:

- Sign in through `POST /api/auth/signin`, then reuse the `wireline_session`
  JWT as `Authorization: Bearer` on `/api/mobile/*`.
- Register a Firebase Cloud Messaging token with `POST /api/mobile/devices`.
- Show workspace health, agents, active calls, recent recaps, wallet balance,
  callback-number settings, and outbound calling.
- Present inbound Wireline calls through Android Telecom as a self-managed
  `ConnectionService`.
- Dispatch in-call device actions to Maps, Calendar, or media search.

## Consumer launch promise

Wireline should be instantly understandable to Android users:

> Ask Wireline to call the pharmacy, doctor, school, airline, landlord,
> restaurant, or support line. It calls, waits, asks, summarizes, and tells you
> what happened.

The native Android app is the everyday control surface for asking Wireline,
reviewing live calls and recaps, taking over a call, and managing callback
handoff.

## Build

Open the `android/` folder in Android Studio and let it sync the Gradle project.
The project targets API 35.

Before a real device build:

1. Create a Firebase Android app with package `com.wireline.app`.
2. Download `google-services.json` and place it at
   `android/app/google-services.json`.
3. Confirm Vercel has `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and
   `FCM_PRIVATE_KEY` for Production, Preview, and Development.
4. Update `BuildConfig.WIRELINE_BASE_URL` in `android/app/build.gradle.kts` if
   you want to point at a preview or local tunnel instead of
   `https://trywireline.com`.
5. Build on a physical phone for push and Telecom behavior.

The Google Services Gradle plugin is applied only when `google-services.json`
exists, so the source can sync before Firebase credentials are available.

## Call Integration

Inbound FCM data messages with `type=incoming_call` call
`TelecomManager.addNewIncomingCall`. Answering the native Android call UI calls
`POST /api/mobile/calls/:callId/handoff`, which transfers the live Vapi call to
the operator callback number saved in Settings.

Android Auto compatibility is through the system Telecom surface. A full branded
Android Auto communication experience still depends on platform eligibility and
review, but the phone/car call primitive is in the native app.

## Backend Contract

The app intentionally stays thin. Business rules remain server-side:

- outbound consent and DNC gates
- agent prompt construction
- plan and wallet enforcement
- live-call transfer
- push fan-out and stale-token pruning

See `src/routes/mobile-routes.ts`, `src/lib/mobile-push.ts`, and
`src/lib/fcm-push.ts` for the backend side.

## Design

Android follows the same Stitch Noir direction as web and iOS:

- canvas: `#0A0A0C`
- panel: `#131315`
- raised panel: `#1B1B1D`
- primary action: `#5D5CFF`
- lavender accent: `#C1C1FF`

Keep Compose screens native-first: Material 3 components, system Telecom for
calls, compact dense cards, strong touch targets, and no fake phone-call claims
outside the backend/Telecom contract.
