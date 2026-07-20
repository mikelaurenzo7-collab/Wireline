# Wireline Android Setup Checklist

Current release truth for the Android surface (**Internal beta** per
`CLIENT_SURFACE_POSTURE` — not Play Store live).

## Product contract

- The app is a native control surface for Command, Agents, Train, Wire, and Calls.
- Product chrome follows Wireline Letterpress. Billing remains web-owned.
- The shell must expose account deletion (via web or in-app), sign-out, and session recovery.

## Environment and secrets

- `WirelineApi` targets production `https://trywireline.com` unless overridden for dogfood.
- Configure `JWT_SECRET` / mobile bearer auth on the server.
- For push (FCM): add `google-services.json` from Firebase console — not committed to the repo.
  Dogfood without FCM still covers sign-in, agent list, and non-marketing outbound.

## Consent (marketing dial)

- `POST /api/mobile/calls/outbound` requires `consentSource` or `consentLeadId` when
  marketing + express written consent is attested (`CONSENT_ARTIFACT_REQUIRED`).
- Native `WirelineApi.placeCall` sends `consentSource=manual_attestation` when the
  marketing checkbox is confirmed. Service/callback dials do not need the artifact.

## Play Console

- Package: `com.wireline.app`
- Target API 36; release signing required before internal testing track.
- Cleartext traffic is disabled in release; debug builds allow localhost only.

## Build and signing

- Run `./gradlew assembleDebug` for local smoke; `./gradlew assembleRelease` before Play upload.
- Test on a physical device for Telecom handoff, FCM incoming call, widgets, and live call UI.
- Sideload the debug APK for internal dogfood — `/settings/apps` Android CTA remains mailto until an internal track exists.

## Release checks

- Call detail screen loads transcript/recording from `/api/mobile/calls/:id/detail`.
- Live call screen appears after Telecom answer and from active call rows.
- Widgets read real snapshot data (no placeholder metrics).
- Train tab uses book icon; Ask Wireline cards render without duplicate content.
- Account deletion path documented (Settings on web or in-app when shipped).
- Marketing outbound with consent checkbox succeeds (consent artifact present).

## Related docs

- `android/README.md`
- `docs/CLIENT_SURFACES.md`
- `docs/CLIENT_SURFACES_STRATEGY_2026-07-20.md`
- `docs/PRODUCT_SHOWCASE_MATRIX.md`
