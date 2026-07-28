# Wireline iOS App Store and CarPlay Readiness

Status: **Canonical native release runbook**

This is the release checklist for shipping the Wireline iOS app and, only after Apple approval, a narrow CarPlay Communication surface. Every claim must map to code in `ios/`, backend routes under `/api/mobile/*`, or App Review notes. Roadmap items stay out of customer metadata.

## Product position

Wireline is an agent platform for calls, texts, follow-up, approvals, and handoff. The iPhone app is the native control surface for active agents. CarPlay is only a safety-constrained calling surface.

The App Store story is:

1. Sign in to an existing Wireline account and confirm account and plan state.
2. View the user's agent roster with role metadata, and create only a lightweight starter agent when account capacity allows.
3. Monitor active calls, recent call recaps, Runtime Balance, and follow-up count.
4. Take explicit handoff actions, including transferring an active agent call to the account holder's saved callback number.
5. Use CallKit, PushKit, widgets, and App Intents for native presentation and explicit user-initiated actions.
6. Place outbound calls only after the user chooses a compliant purpose and, for marketing or promotional calls, confirms express written consent; backend DNC, federal DNC, TCPA, entitlement, and spend gates make the final decision.
7. Use CarPlay only for active call routing, recent callbacks, and agent-line visibility.

Native scope remains companion-first until the web activation loop is consistently successful. Keep billing and top-ups, CRM setup, broad integration configuration, long-form Training, analytics, admin controls, and complex agent-policy authoring on the web. Native may show read-only account and Runtime Balance status plus small operational edits such as the handoff callback number.

## Apple constraints

- App Review expects complete metadata, a live backend, demo access, privacy clarity, and review notes for non-obvious features.
- CarPlay requires category-specific entitlement approval before signing with `com.apple.developer.carplay-communication`.
- CarPlay must stay minimal: no free-form AI chat, long summaries, Training, billing, usage, analytics, admin controls, or marketing surfaces.
- CallKit owns native incoming and outgoing call UI; CarPlay only reflects approved Communication templates.

## Phase 0: entitlement packet

- [ ] Apple Developer account has App IDs for `com.wireline.app` and `com.wireline.app.widgets`.
- [ ] Push Notifications, Background Modes, App Groups, Siri, and App Intents are configured only where used by the shipped build.
- [ ] Submit the CarPlay entitlement request for Communication only.
- [ ] Use this entitlement explanation:

```text
Wireline is a communication app for explicit user-initiated agent calling tasks.
Authenticated users can receive calls through CallKit/PushKit, ask a Wireline
agent to place outbound calls with a user-provided message, and call recent
contacts back while driving. The CarPlay UI is limited to Apple's Communication
templates: active call routing, recent callbacks, and agent-line visibility.
It does not provide browsing, free-form AI chat, marketing pages, payments,
Training, usage management, or non-driving tasks in the car.
```

## Phase 1: iPhone App Store submission

- [ ] Submit without the CarPlay entitlement if Apple has not granted it.
- [ ] Provide a demo account with seeded agents, recent calls, and a callback number already configured.
- [ ] Keep `/api/auth/*` and `/api/mobile/*` live for the full review window.
- [ ] Explain that outbound calls are placed server-side through Wireline voice agents and may call a supplied test phone number.
- [ ] Privacy Nutrition Labels cover account identifiers, phone numbers, call metadata, diagnostics, and analytics actually shipped in the binary.
- [ ] Metadata avoids unsupported claims: no autonomous emergency calling, guaranteed recording legality, or background-microphone claims beyond active calls.

## Mobile companion capability audit

| Capability | Backend contract | iOS / widget support | Android support | Launch posture |
| --- | --- | --- | --- | --- |
| Authenticated account state | `GET /api/mobile/me` returns user, account, quota, extra-agent metadata, and settings. | `MobileMe` decodes bootstrap; workspace and settings use it. | `WirelineViewModel.refreshNow()` loads `me` after token sign-in. | Supported; native is a signed-in companion, not an anonymous onboarding funnel. |
| Agent list and role metadata | `GET /api/mobile/agents` and `/api/mobile/agents/roles`; `POST /api/mobile/agents` validates role and capacity. | `Agent`, `AgentRole`, and the native agent library read the catalog. | `Agent`, `AgentRole`, and agent creation mirror the same contract. | Supported for roster and lightweight creation only; deep Training stays web-first. |
| Active and recent calls | `/calls/active`, `/calls/recent`, and `/calls/:id/detail` are scoped to the authenticated user. | Calls views and widgets read active, recent, and detail data. | View model refreshes active and recent data and exposes call detail. | Supported as core companion behavior. |
| Runtime Balance readout | `GET /api/mobile/wallet` is read-only. | Wallet screen and widgets show balance and ledger. | Wallet screen and widget snapshot show balance and ledger. | Read-only; Stripe top-ups and billing management stay on web. |
| Handoff actions | `PUT /settings` saves `handoffPhone`; `POST /calls/:callId/handoff` transfers active calls. | Settings, Calls, Live Call, and CarPlay handoff call the API. | Settings, live-call screen, and view model call the API. | Supported for explicit user action only. |
| Push and device registration | `POST /devices` upserts APNs/FCM tokens; `DELETE /devices/:id` unregisters. | `WirelineAPI.registerDevice` and `CallManager` register APNs and VoIP tokens. | Push registration uses FCM and sign-out unregisters. | Supported; required for native call wakeups. |
| Safe outbound-call consent | `POST /calls/outbound` requires `callPurpose`, normalizes express consent, and applies DNC, TCPA, entitlement, and spend gates. | Outbound UI and intents pass purpose and consent; marketing requires confirmation. | Ask and Call UI pass purpose and consent; marketing requires confirmation. | Supported only for explicit user-initiated calls; no native bulk outreach or CRM campaigns. |

## CarPlay information architecture

Allowed in car:

| Surface | Review posture |
| --- | --- |
| Signed-out prompt | One-line instruction; no login in car. |
| Loading state | Short status while the phone fetches data. |
| Active-call routing | One-tap, user-initiated handoff and call state. |
| Recent callbacks | Primary Communication use case. |
| Agent-line list | Glanceable context for which line will place calls. |
| Empty or error state | Prevents dead screens. |

Not allowed in car:

- Ask Wireline free-form composer.
- Long call summaries or transcripts.
- Training, settings, billing, Runtime Balance, onboarding, analytics, or admin controls.
- Device-action setup for Maps, Music, or Calendar.
- Any control of another app's CarPlay surface.

## App Review notes template

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
  call routing, recent callbacks, and agent-line visibility.

Test path:
1. Sign in with the demo account.
2. Open calls and recaps.
3. Use Siri/App Shortcuts for a recent-call summary.
4. Place an outbound call to the supplied test number with a short instruction.
5. If reviewing CarPlay, connect the CarPlay Simulator and confirm the active
   call grid, recent callbacks, and agent lines.
```

## Release blockers

- [ ] Privacy policy URL and support URL are live and match submitted metadata.
- [ ] No placeholder copy, fake prices, or dormant CarPlay claims appear in metadata.
- [ ] Usage descriptions in `Info.plist` match real runtime behavior.
- [ ] Demo account does not require 2FA, manual approval, or production secrets.
- [ ] PushKit reports incoming calls immediately.
- [ ] CarPlay entitlement is absent from signed builds until Apple grants it.
- [ ] TestFlight build has been exercised on a physical device for sign-in, outbound call, VoIP inbound call, Siri/App Intents, widgets, and callback handoff.

## Related sources

- [iOS surface README](../ios/README.md)
- [Client surface boundaries](./CLIENT_SURFACES.md)
- `ios/project.yml`
- `src/routes/mobile-routes.ts`
- `src/lib/apns-push.ts`