# Wireline iOS Setup Checklist

Current release truth for the iOS surface. This replaces the old theme and parity checklist.

## Product contract

- The app is a native control surface for `Agents`, `Training`, `Wire`, `Inbox`, and live call control.
- Product chrome follows Wireline Mono. Do not reintroduce retired brand copy or palette claims.
- Billing remains web-owned. iOS may show usage and Conversation Balance, but it must not sell balance in-app.
- The iOS shell must expose account deletion, sign-out, and authenticated recovery paths.

## Environment and secrets

- Set `WirelineConfig.baseURL` to the correct environment.
- Configure `JWT_SECRET` on the server so mobile bearer auth can validate sessions.
- Configure push only if the release needs live notifications:
  - `APNS_KEY_ID`
  - `APNS_TEAM_ID`
  - `APNS_AUTH_KEY`
  - `APNS_BUNDLE_ID`
  - `APNS_ENV`

## Apple portal

- App ID: `com.wireline.app`
- Widget App ID: `com.wireline.app.widgets`
- Enable Push Notifications, Background Modes, and App Intents only where the shipped surface needs them.
- Keep CarPlay limited to approved communication flows. Do not add browsing or general chat behavior to the car surface.

## Build and signing

- Run `xcodegen generate` inside `ios/` before opening the workspace if project files drift.
- Set the development team on both the main app target and the widget target.
- Verify the bundle identifiers match the configured Apple portal entries.
- Test on a physical device before TestFlight when call control, push, widgets, or CarPlay behavior changes.

## Release checks

- Agents tab labels and empty states use `agent` language, not `assistant`.
- Training uses the current route and tab naming.
- Wire uses the current route and tab naming.
- Account deletion is reachable from settings.
- Widgets and intents deep-link into the current app routes.
- Account-bound auth failures fall back cleanly to sign-in instead of leaving dead surfaces.

## Related docs

- `ios/README.md`
- `ios/APP_STORE_CARPLAY_READINESS.md`
- `docs/CLIENT_SURFACES.md`
- `docs/CHATGPT_APP.md`
