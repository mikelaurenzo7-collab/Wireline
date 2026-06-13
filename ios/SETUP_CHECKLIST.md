# Wingman — setup checklist

Everything outside the code needed for Wingman to work end-to-end, split by
**who** does it. Most of the work is yours (platform owner) and happens once;
the last short section is done by **each end user** on their own iPhone.

---

## PART 1 — You (platform owner), once for everyone

### Backend env (Vercel — Production + Preview + Dev)

Already present (in use by the platform):
- [x] `VAPI_PRIVATE_KEY` — voice runtime + live call transfer ("take this call").
- [x] `JWT_SECRET` — mobile Bearer auth reuses the existing session JWT.

**Twilio phone provisioning is still wired and unchanged**
(`src/lib/phone-provisioning.ts`, `POST /api/phone-numbers/provision`). It needs
these at runtime for auto number provisioning + outbound caller-ID + SMS:
- [ ] `TWILIO_ACCOUNT_SID`
- [ ] `TWILIO_AUTH_TOKEN`
  > "Take this call" handoff uses **Vapi live control, not Twilio**, so it works
  > even if Twilio creds are locked down. Provisioning and SMS still need Twilio.

New for Wingman push (optional — without them, push is a safe no-op):
- [ ] `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_AUTH_KEY` (the `.p8` contents,
      newlines escaped as `\n` — never commit the .p8), `APNS_BUNDLE_ID`
      (`com.wireline.wingman`), `APNS_ENV` (`production` or `sandbox`).

### Apple Developer portal
- [ ] App ID `com.wireline.wingman` with Push Notifications, Background Modes, SiriKit.
- [ ] App ID `com.wireline.wingman.widgets` (widget extension).
- [ ] APNs **Auth Key** (.p8) → feeds the `APNS_*` env vars.
- [ ] **Request the CarPlay Communication entitlement** — Apple approval is
      slow, start early. (Phase 2; not needed for the iPhone app.)

### App Store / CarPlay review prep
- [ ] Complete `ios/EVERYDAY_SHORTCUTS_PLAN.md` and `ios/APP_STORE_CARPLAY_READINESS.md` before TestFlight external review or App Store submission.
- [ ] Prepare the CarPlay Communication entitlement request narrative before adding any CarPlay entitlement to the signed app.
- [ ] Seed an App Review demo account with agents, recent calls, and a callback number so reviewers can exercise the account-gated flows without manual support.

### Xcode / build / ship
- [ ] `brew install xcodegen` then `cd ios && xcodegen generate`.
- [ ] Set your **Development Team** on both targets (`Wingman`, `WingmanWidgets`).
- [ ] Point `WingmanConfig.baseURL` at your environment.
- [ ] Run on a **physical device** (PushKit VoIP + CarPlay need real hardware),
      then TestFlight / App Store.

### Database
- [x] Migrations `0055` (mobile devices) + `0056` (call handoff) are idempotent
      and ship in `drizzle/migrations/`. Apply on deploy with your normal flow.

---

## PART 2 — Each end user, in the app (NOT you)

These are per-person and happen inside the installed app — you don't and can't
do them on a user's behalf. Siri phrases and widgets work with **zero** setup;
the two below are the only manual touches, and only the first is required.

- [ ] **Set a callback number** (Settings → Callback number). Required to use
      "take this call" — it's *that user's own* number, where their live calls
      transfer. iOS hides the device's number from apps, so it must be typed
      once. (We can prompt for this during onboarding — see note below.)
- [ ] **(Optional) Assign Action button / Back Tap** to the "Ask Wingman"
      shortcut, in iOS **Settings** (not in our app — Apple only lets the device
      owner set these). The `ActivationSetupView` screen shows users how.

> Onboarding option (not yet built): prompt for the callback number on first
> launch or the first "take this call" tap, so users never hunt for the
> setting. Say the word and I'll add it.

---

## PART 3 — Decisions for you (not blocking)

### Android support
The **backend is already platform-neutral** — `/api/mobile/*` is REST + Bearer
JWT, and `wireline_mobile_devices.platform` already exists. Android is a client
+ push problem, not a backend rewrite. To add it later:
- Backend: add an **FCM** sender (`fcm-push.ts`) beside `apns-push.ts`, an
  `fcm_token` column, and a `platform` branch in `notifyInboundCall` /
  `notifyCallRecap`. (Small.)
- App: native **Kotlin + Jetpack Compose** in a new `android/` folder, mirroring
  the iOS screens; **Telecom/ConnectionService** for native call UI and
  **high-priority FCM** for inbound wake; **Android Auto** instead of CarPlay.
- Caveats to weigh: Android background wake is less bulletproof than iOS
  PushKit (OEM battery managers); Android Auto is stricter for calling apps.
- **Decision pending:** native Kotlin (recommended, symmetric with iOS) vs a
  cross-platform framework. Nothing built yet — flagged for when you want it.
