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
