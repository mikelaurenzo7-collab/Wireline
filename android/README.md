# Assistant Android

Native Android client for Wireline Assistant. It mirrors the iOS mobile API and uses Android-native phone surfaces instead of a cross-platform shell.

## Scope

1. Sign in through the existing Wireline auth flow.
2. Load workspace, agents, active calls, recent calls, call detail, settings, and read-only wallet.
3. Place outbound calls through `/api/mobile/calls/outbound`.
4. Register the device through `/api/mobile/devices` with `platform: "android"`.
5. Show native incoming-call UI through Android Telecom/Core-Telecom.
6. Add Android Auto after phone reliability is proven.

## Platform decisions

- Kotlin plus Jetpack Compose.
- OkHttp plus kotlinx.serialization for API calls.
- Android Keystore-backed encrypted app storage for local auth.
- Core-Telecom / Telecom APIs for native call lifecycle.
- Firebase Cloud Messaging for wake, recaps, and device actions.

## Backend readiness

Production Supabase now has mobile device storage, call handoff fields, read-only credit ledger storage, and Android delivery storage applied. The remaining backend code task is widening `/api/mobile/devices` from iOS-only to `ios | android`.

## Review constraints

- Do not promise Android Auto until phone call reliability is complete.
- Do not ship service credentials in the app.
- Do not send sensitive transcript content in notification payloads; fetch detail after open.
- Keep wallet read-only in-app. Purchases stay on the web.
