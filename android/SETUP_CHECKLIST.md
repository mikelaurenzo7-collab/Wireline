# Wireline Android Setup Checklist

Current release truth for the Android surface.

## Product contract

- The app is a native control surface for Command, Agents, Train, Wire, and Calls.
- Product chrome follows Wireline Letterpress. Billing remains web-owned.
- The shell must expose account deletion (via web or in-app), sign-out, and session recovery.

## Environment and secrets

- `WirelineApi` targets production `https://trywireline.com` unless overridden for dogfood.
- Configure `JWT_SECRET` / mobile bearer auth on the server.
- For push (FCM): add `google-services.json` from Firebase console — not committed to the repo.

## Play Console

- Package: `com.wireline.app`
- Target API 35; release signing required before internal testing track.
- Cleartext traffic is disabled in release; debug builds allow localhost only.

## Build and signing

- Run `./gradlew assembleDebug` for local smoke; `./gradlew assembleRelease` before Play upload.
- Test on a physical device for Telecom handoff, FCM incoming call, widgets, and live call UI.

## Release checks

- Call detail screen loads transcript/recording from `/api/mobile/calls/:id/detail`.
- Live call screen appears after Telecom answer and from active call rows.
- Widgets read real snapshot data (no placeholder metrics).
- Train tab uses book icon; Ask Wireline cards render without duplicate content.
- Account deletion path documented (Settings on web or in-app when shipped).

## Related docs

- `android/README.md`
- `docs/CLIENT_SURFACES.md`
- `docs/PRODUCT_SHOWCASE_MATRIX.md`
