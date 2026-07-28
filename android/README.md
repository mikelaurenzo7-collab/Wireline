# Wireline Android

Native Kotlin + Jetpack Compose client for the Wireline mobile API. **Product posture: Internal beta** until physical-device acceptance, release signing, privacy review, and a Play internal-testing track are complete.

The Android app is the everyday control surface for Wireline agents:

- Sign in through `POST /api/auth/signin`, then reuse the Wireline session JWT as `Authorization: Bearer` on `/api/mobile/*` requests.
- Register Firebase Cloud Messaging tokens through `POST /api/mobile/devices`.
- Ask Wireline to place a call, review call updates and recaps, manage callback handoff, and inspect Runtime Balance.
- Present inbound Wireline calls through Android Telecom as a self-managed `ConnectionService`.
- Dispatch supported in-call device actions to Maps, Calendar, or media search.

## Product promise

> Wire your agent.

The native product is a daily control surface for agents, calls, recaps, and follow-up. Business and personal workflows share the same backend agent configuration, while the interface remains practical and agent-forward. Billing, provider policy, prompts, compliance gates, and tenant enforcement remain server-owned.

## Design contract

The Google Stitch project contains two implementation tracks:

- Desktop web deliverables map to the React web application.
- Native mobile deliverables map to both this Compose app and the SwiftUI iOS app. They are not mobile-web layouts.

Android follows Wireline Letterpress while remaining Material-native:

- cool obsidian canvas `#0A0A0E`, surface cards `#141319`, secondary surfaces `#100F15`, and primary ink `#F5F4F8`;
- electric-violet primary action `#A78BFA`, pressed state `#8B5CF6`, platinum-silver wire accent `#C7CCD6`, and semantic status colors only where required;
- compact controls, restrained radius, and a clear 4dp/8dp spacing rhythm;
- no retired forest-green/copper palette, signal blue, cyan, mesh, or decorative gradients;
- agent language: agents, calls, texts, recaps, and follow-up, not Live Ops or operator dashboards;
- Material 3, TalkBack labels, dynamic font scaling, Android system insets, notification permission, and Telecom behavior remain native.

## Build and environment

Open `android/` in Android Studio and let Gradle sync. The project compiles against and targets API 36.

Before a real-device build:

1. Create a Firebase Android app with package `com.wireline.app`.
2. Download `google-services.json` and place it at `android/app/google-services.json`. It is ignored and must never be committed.
3. Configure `FCM_PROJECT_ID`, `FCM_CLIENT_EMAIL`, and `FCM_PRIVATE_KEY` only in the environments that need push.
4. Override `BuildConfig.WIRELINE_BASE_URL` in `android/app/build.gradle.kts` for an approved preview or local tunnel when dogfooding.
5. Run `./gradlew assembleDebug` for local smoke and `./gradlew assembleRelease` before Play upload.
6. Validate push, Telecom, live-call handoff, widgets, and notification permission on a physical phone.

The Google Services Gradle plugin is applied only when `google-services.json` exists, so source sync works before Firebase credentials are available. Release builds disable cleartext traffic; debug permits localhost only.

## Authentication and account recovery

- Mobile requests use Bearer authentication and do not rely on browser cookies.
- Auth failures must clear unusable local state and return to sign-in rather than leaving a dead shell.
- Settings must expose sign-out, session recovery, and an account-deletion path through the implemented native or web-owned workflow.
- Billing and Runtime Balance top-ups remain web-owned; Android may display read-only balance and usage state.

## Consent and outbound calling

`POST /api/mobile/calls/outbound` requires the purpose and evidence expected by the shared server gate. Marketing or promotional calls require explicit confirmation plus `consentSource` or `consentLeadId`; the native client currently sends `consentSource=manual_attestation` when the checkbox is confirmed. Service and callback calls do not invent a marketing artifact.

The backend remains authoritative for tenant DNC, federal DNC, TCPA hours and consent, entitlement, agent capacity, and spend controls. No Android path may bypass the shared outbound gate.

## Call integration

Inbound FCM data messages with `type=incoming_call` call `TelecomManager.addNewIncomingCall`. Answering the native Android call UI calls `POST /api/mobile/calls/:callId/handoff`, which transfers the live call to the callback number saved in Settings.

Android Auto compatibility comes through the system Telecom surface. A branded Android Auto communication experience still depends on platform eligibility and review; the phone/car calling primitive itself remains native.

## Backend contract

The app intentionally stays thin. The server owns:

- outbound consent and DNC gates;
- agent prompt construction and model/provider policy;
- plan, capacity, and Runtime Balance enforcement;
- live-call transfer;
- push fan-out and stale-token pruning;
- account authorization and tenant isolation.

See `src/routes/mobile-routes.ts`, `src/lib/mobile-push.ts`, and `src/lib/fcm-push.ts`.

## Managed realtime voice

Authenticated live tests use Wireline's managed OpenAI Realtime session contract. The backend creates a short-lived ephemeral client secret, applies the selected agent's server-owned instructions and bounded tools, and keeps provider credentials out of the app. Production PSTN calls remain on the approved telephony path; the native client never selects or configures a provider directly.

See `src/lib/voice/openai-live-agent-service.ts`, `src/routes/grok-voice-routes.ts` (legacy filename; handlers are OpenAI Realtime), and `docs/GROK_LIVE_VOICE.md`.

## Release checklist

- Package remains `com.wireline.app`; target and compile SDK remain API 36 or newer.
- Release signing is configured before Play internal testing.
- Call detail loads transcript and recording data from `/api/mobile/calls/:id/detail` only for the authenticated account.
- Live-call UI appears after Telecom answer and from active-call rows.
- Widgets read real snapshot data and do not ship placeholder metrics.
- Training and Wire use current product names and routes.
- Account deletion, sign-out, and auth recovery are reachable.
- Marketing outbound succeeds only with the required confirmation and consent evidence.
- FCM incoming call, Telecom handoff, notification permission, and stale-token cleanup are exercised on a physical device.
- The in-product Android CTA must not claim Play availability until a real testing or production listing exists.

## Related documentation

- [Client surface boundaries](../docs/CLIENT_SURFACES.md)
- [Multi-surface QA](../docs/MULTI_SURFACE_QA_2026-07-07.md)
- [Product showcase matrix](../docs/PRODUCT_SHOWCASE_MATRIX.md)