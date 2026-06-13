# Wingman — "Your end" setup checklist

Running list of everything **you** need to do outside the code for Wingman to
work end-to-end. Code that's already done is noted; the unchecked boxes are on
you (Apple portal, Vercel env, Xcode signing).

## Backend env (Vercel — Production + Preview + Dev)

Already present (confirmed in use by the platform):
- [x] `VAPI_PRIVATE_KEY` — voice runtime + live call transfer ("take this call").
- [x] `JWT_SECRET` — mobile Bearer auth reuses the existing session JWT.

**Twilio phone provisioning is still wired and unchanged** (`src/lib/phone-provisioning.ts`,
`POST /api/phone-numbers/provision`). It needs these at runtime — set them if
you want auto number provisioning and outbound caller-ID:
- [ ] `TWILIO_ACCOUNT_SID`
- [ ] `TWILIO_AUTH_TOKEN`
  > Note: the "take this call" handoff deliberately uses **Vapi live control,
  > not Twilio**, so it works even if Twilio creds are locked down. Provisioning
  > and SMS still require Twilio.

New for Wingman push (optional — without them, push is a safe no-op):
- [ ] `APNS_KEY_ID` — APNs auth key id (Apple Developer → Keys).
- [ ] `APNS_TEAM_ID` — your 10-char Apple Team ID.
- [ ] `APNS_AUTH_KEY` — contents of the `AuthKey_XXXX.p8` (escape newlines as `\n`). **Never commit the .p8.**
- [ ] `APNS_BUNDLE_ID` — `com.wireline.wingman`.
- [ ] `APNS_ENV` — `production` (or `sandbox` for dev device builds).

## Apple Developer portal

- [ ] Create the App ID `com.wireline.wingman` with capabilities: Push
      Notifications, Background Modes, SiriKit, Associated Domains (later).
- [ ] Create an **APNs Auth Key** (.p8) → feeds `APNS_*` above.
- [ ] Register the widget App ID `com.wireline.wingman.widgets`.
- [ ] **Request the CarPlay Communication entitlement**
      (`com.apple.developer.carplay-communication`). Apple approval is slow —
      do this early. (Phase 2; not needed for the iPhone app.)

## Xcode / build

- [ ] `brew install xcodegen` then `cd ios && xcodegen generate`.
- [ ] Set your **Development Team** in Signing & Capabilities (both the
      `Wingman` and `WingmanWidgets` targets).
- [ ] Point `WingmanConfig.baseURL` at your environment (local/preview/prod).
- [ ] Run on a **physical device** — PushKit VoIP + CarPlay-on-device need
      real hardware.

## In-app (one-time per user)

- [ ] Set a **callback number** in the app (Settings) so "take this call" knows
      where to transfer — iOS can't read the device's own number.
- [ ] (Optional) Assign the **Action button** and **Back Tap** to the
      "Ask Wingman" shortcut in iOS Settings — the app can't do this for you.

## Database

- [x] Migrations `0055` (mobile devices) + `0056` (call handoff) are idempotent
      and ship in `drizzle/migrations/`. Apply with your normal `db:push` /
      migration flow on deploy.
