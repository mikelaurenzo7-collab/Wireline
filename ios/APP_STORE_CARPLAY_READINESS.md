# Wireline iOS App Store And CarPlay Readiness

This is the launch checklist for shipping the Wireline iOS app and, only after
Apple approval, a narrow CarPlay Communication surface. Every claim here must
map to code in `ios/`, backend routes under `/api/mobile/*`, or App Review
notes. Roadmap items must stay out of customer metadata.

## Product Position

Wireline is an agent platform for calls, texts, follow-up, approvals, and
handoff. The iPhone app is the native control surface for active agents.
CarPlay is only a safety-constrained calling surface.

The App Store story is:

1. Create an agent with a short role and starting brief.
2. Train it on sources, behavior, voice, policy, and evaluation.
3. Run calls, texts, follow-up, approvals, and handoff from native controls.
4. Use CallKit and PushKit for native inbound-call presentation.
5. Use App Intents and widgets for explicit user-initiated actions.
6. Use CarPlay only for active call routing, recent callbacks, and agent line visibility.

## Apple Constraints

- App Review expects complete metadata, a live backend, demo access, privacy
  clarity, and review notes for non-obvious features.
- CarPlay requires category-specific entitlement approval before signing with
  `com.apple.developer.carplay-communication`.
- CarPlay must stay minimal: no free-form AI chat, long summaries, Training,
  billing, usage, analytics, admin controls, or marketing surfaces.
- CallKit owns native incoming and outgoing call UI; CarPlay only reflects
  approved Communication templates.

## Phase 0 - Entitlement Packet

- [ ] Apple Developer account has App IDs for `com.wireline.app` and
  `com.wireline.app.widgets`.
- [ ] Push Notifications, Background Modes, App Groups, Siri, and App Intents
  are configured only where used by the shipped build.
- [ ] Submit the CarPlay entitlement request for Communication only.
- [ ] Use this entitlement explanation:

```text
Wireline is a communication app for explicit user-initiated agent calling tasks.
Authenticated users can receive calls through CallKit/PushKit, ask a Wireline
agent to place outbound calls with a user-provided message, and call recent
contacts back while driving. The CarPlay UI is limited to Apple's Communication
templates: active call routing, recent callbacks, and agent line visibility.
It does not provide browsing, free-form AI chat, marketing pages, payments,
Training, usage management, or non-driving tasks in the car.
```

## Phase 1 - iPhone App Store Submission

- [ ] Submit without the CarPlay entitlement if Apple has not granted it.
- [ ] Provide a demo account with seeded agents, recent calls, and a callback
  number already configured.
- [ ] Keep `/api/auth/*` and `/api/mobile/*` live for the full review window.
- [ ] Explain that outbound calls are placed server-side through Wireline voice
  agents and may call a supplied test phone number.
- [ ] Privacy Nutrition Labels cover account identifiers, phone numbers, call
  metadata, diagnostics, and analytics actually shipped in the binary.
- [ ] Metadata avoids unsupported claims: no autonomous emergency calling, no
  guaranteed recording legality, and no background microphone claims beyond
  active calls.

## CarPlay Information Architecture

Allowed in car:

| Surface | Review posture |
| --- | --- |
| Signed-out prompt | One-line instruction; no login in car |
| Loading state | Short status while the phone fetches data |
| Active-call routing | One-tap, user-initiated handoff and call state |
| Recent callbacks | Primary Communication use case |
| Agent line list | Glanceable context for which line will place calls |
| Empty/error state | Prevents dead screens |

Not allowed in car:

- Ask Wireline free-form composer.
- Long call summaries or transcripts.
- Training, settings, billing, wallet, onboarding, analytics, or admin controls.
- Device-action setup for Maps, Music, or Calendar.
- Any control of another app's CarPlay surface.

## App Review Notes Template

```text
Wireline is an agent platform for calls, texts, follow-up, approvals, and
handoff. It uses account sign-in, CallKit/PushKit for inbound calls, App Intents
for user-initiated Siri and Shortcuts actions, and a backend API at
/api/mobile/*.

Demo account:
Email: <review-demo-email>
Password: <review-demo-password>
Callback number: <test phone number Apple can call>
Seeded data: 2 agents, 5 recent calls, 1 call flagged for follow-up.

Non-obvious features:
- Outbound calls are placed server-side through Wireline voice agents.
- VoIP pushes show native CallKit UI immediately when an inbound Wireline call arrives.
- If the submitted build includes CarPlay, the CarPlay UI is limited to active
  call routing, recent callbacks, and agent line visibility.

Test path:
1. Sign in with the demo account.
2. Open calls and recaps.
3. Use Siri/App Shortcuts for a recent-call summary.
4. Place an outbound call to the supplied test number with a short instruction.
5. If reviewing CarPlay, connect the CarPlay Simulator and confirm the active
   call grid, recent callbacks, and agent lines.
```

## Release Blockers

- [ ] Privacy policy URL and support URL are live and match submitted metadata.
- [ ] No placeholder copy, fake prices, or dormant CarPlay claims in metadata.
- [ ] Usage descriptions in `Info.plist` match real runtime behavior.
- [ ] Demo account does not require 2FA, manual approval, or production secrets.
- [ ] PushKit reports incoming calls immediately.
- [ ] CarPlay entitlement is absent from signed builds until Apple grants it.
- [ ] TestFlight build has been exercised on a physical device for sign-in,
  outbound call, VoIP inbound call, Siri/App Intents, widgets, and callback handoff.
