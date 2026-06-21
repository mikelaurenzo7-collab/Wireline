# Wireline — App Store + CarPlay readiness plan

This is the launch plan for shipping Wireline on the iOS App Store and then
unlocking the CarPlay Communication surface once Apple grants the entitlement.
It is intentionally strict: every claim must map to code in `ios/`, backend
routes under `/api/mobile/*`, or an App Review note. If a feature is aspirational,
label it as a roadmap item, not a shipped capability.

## Source anchors

- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/) — completeness, metadata, demo access, privacy, and review notes.
- [Apple CarPlay developer page](https://developer.apple.com/carplay/) — CarPlay templates, simulator tooling, design guidance, and entitlement request entry point.
- [Requesting CarPlay Entitlements](https://developer.apple.com/documentation/carplay/requesting-carplay-entitlements) — category-specific entitlement approval before shipping CarPlay.

## North star

Wireline is an **everyday call concierge for regular people first**, with business calling as an optional workspace mode. The iPhone app is the primary product; CarPlay is the safe in-car companion for a narrow subset of the same calling workflow. The App Store story is not "AI in your car" or "business-only phone ops" — it is:

1. Ask Wireline to place routine personal calls: doctors, pharmacies, restaurants, schools, landlords, airlines, support lines, family, and local services.
2. Give Wireline a short user-directed message or goal, such as "tell them I'm running late" or "check whether my prescription is ready."
3. Use CallKit/PushKit for native inbound-call presentation and handoff.
4. Use App Intents and App Shortcuts for fast, user-initiated voice actions across Siri, Shortcuts, widgets, Action button, Back Tap, Control Center, and Spotlight.
5. Use CarPlay only for Communication-category call surfaces: active call routing, recent callbacks, and assistant line visibility.

## Apple constraints to design around

- App Review expects complete metadata, a live backend, demo access for account-gated apps, review notes for non-obvious features, and tested builds.
- CarPlay requires category-specific entitlement approval before signing with the CarPlay capability. Wireline should request **Communication** only.
- CarPlay is not a separate iOS app extension in this repo. It is a CarPlay scene connected from the phone app via `CPTemplateApplicationSceneDelegate`; CallKit still owns the native incoming/outgoing call UI.
- The car UI must stay minimal: no free-form AI chat, no long summaries to read, no admin setup, no billing, no dashboards, and no custom templates outside the approved Communication category.

## Ship sequence

### Phase 0 — entitlement packet, before binary submission

- [ ] Apple Developer account has App IDs for `com.wireline.app` and `com.wireline.app.widgets`.
- [ ] Push Notifications, Background Modes, App Groups if added later, and Siri/App Intents are configured for the app target.
- [ ] Submit the CarPlay entitlement request for `com.apple.developer.carplay-communication` with this explanation:

> Wireline is a personal communication app for user-initiated calling tasks. It lets authenticated users receive calls via CallKit/PushKit, ask Wireline to place everyday outbound calls such as doctor/pharmacy/restaurant/support calls with a user-provided message, and call recent contacts back while driving. The CarPlay UI is limited to Apple's Communication templates: active call routing, recent callbacks, and assistant line visibility. It does not provide browsing, free-form AI chat, marketing dashboards, payments, or non-driving tasks in the car.

### Phase 1 — iPhone App Store submission

- [ ] Submit without the CarPlay entitlement if Apple has not granted it yet; keep CarPlay described as "coming after entitlement approval" only in internal notes, not customer metadata.
- [ ] Provide a full demo account in App Review notes with seeded assistants, recent calls, and a callback number already configured.
- [ ] Backend production URL is live for `/api/auth/*` and `/api/mobile/*` for the whole review window.
- [ ] App Review notes explain that outbound calls are placed by the backend via Wireline/Vapi and may call a test phone number supplied in the notes.
- [ ] Privacy Nutrition Labels cover account identifiers, phone numbers, call metadata, diagnostics, and any analytics actually shipped in the binary.
- [ ] The app description avoids unsupported promises: no autonomous emergency calling, no guaranteed call recording legality, no controlling other apps' CarPlay UIs, and no background microphone claims beyond active calls.

### Phase 2 — CarPlay entitlement build

- [ ] Add `com.apple.developer.carplay-communication` to `Wireline/Wireline.entitlements` only after Apple grants it and provisioning profiles contain the capability.
- [ ] Regenerate the Xcode project and archive with a provisioning profile that includes the CarPlay Communication entitlement.
- [ ] Include CarPlay screenshots/video in the entitlement response or App Review notes: signed-out state, recent callbacks, assistant lines, native CallKit inbound call UI, and disconnected/error state.
- [ ] Verify the CarPlay Simulator and at least one real head unit or car where possible; PushKit and true call handoff still require a physical iPhone.

## CarPlay information architecture

Allowed in car:

| Surface | Why it is safe | Implementation |
| --- | --- | --- |
| Signed-out prompt | One-line instruction; no login in car | `loadingTemplate()` |
| Loading state | Short status while the phone fetches data | `loadingTemplate()` |
| Active-call routing | One-tap, user-initiated handoff and call state | `rootTemplate(me:activeCalls:recents:assistants:)` |
| Recent callbacks | Primary Communication use case | `rootTemplate(me:activeCalls:recents:assistants:)` |
| Assistant line list | Glanceable context for which line will place calls | `showAssistants(_:)` |
| Empty/error state | Prevents dead screens | `rootTemplate(me:activeCalls:recents:assistants:)` |

Not allowed in car:

- Ask Wireline free-form composer.
- Long call summaries or transcripts.
- Training, settings, billing, wallet, onboarding, analytics, or admin dashboards.
- Device-action setup for Maps/Music/Calendar.
- Any control of Spotify, Maps, Calendar, or another app's CarPlay surface.

## App Intents inventory

| Intent | Launches app? | Review posture | CarPlay posture |
| --- | --- | --- | --- |
| Ask Wireline | Yes | Safe iPhone entry point; user initiates | Do not expose in CarPlay |
| Place a call | No/voice flow | Core communication action | OK only as a call action, not free-form browsing |
| Take this call | No | Explicit user-requested live-call handoff | OK from the active-call grid |
| Summarize last call | No | Keep spoken response short and sourced from recent call data | Do not put long summary text in CarPlay |
| What needs attention | No | Spoken digest only; no sensitive details in lock-screen text | Do not expose as car reading list |
| Open Wireline | Yes | Standard app launch | Not needed in CarPlay |

## Future intent candidates

1. **Call back my last missed call** — strongest driving use case; maps directly to recent callback.
2. **Pick which live call to transfer** — when multiple backend calls are eligible, ask a brief confirmation instead of guessing.
3. **Mark last call followed up** — low distraction if it is a one-tap/spoken status change; do not expose notes entry while driving.
4. **Send me the recap** — delivers a push/email later instead of reading long text in the car.

## App Review notes template

```text
Wireline is a personal call concierge. It uses account sign-in, CallKit/PushKit for inbound calls, App Intents for user-initiated Siri and Shortcuts actions, and a backend API at /api/mobile/*. Business workspaces are supported, but the default review path is an everyday user asking Wireline to make or summarize routine calls.

Demo account:
Email: <review-demo-email>
Password: <review-demo-password>
Callback number: <test phone number Apple can call>
Seeded data: 2 personal assistants, 5 recent everyday calls, 1 call flagged for follow-up.

Non-obvious features:
- Outbound calls are placed server-side through Wireline voice agents.
- VoIP pushes show native CallKit UI immediately when an inbound Wireline call arrives.
- If the submitted build includes CarPlay, the CarPlay UI is limited to the Communication entitlement: active call routing, recent callbacks, and assistant line visibility.

Test path:
1. Sign in with the demo account.
2. Open Recaps to see recent everyday calls.
3. Use Siri/App Shortcuts: "Ask Wireline to summarize my last call" and "Have Wireline take this" when a seeded live call is available.
4. Place an outbound call to the supplied test number with a personal instruction such as "tell the doctor I am running late".
5. If reviewing CarPlay, connect the CarPlay Simulator and confirm the signed-in active-call grid, recent callbacks, and assistants list.
```

## Screenshot set

- iPhone 6.7": signed-in workspace, calls list, call detail, outbound call, Ask Wireline, settings callback number, activation setup.
- iPhone 6.1": workspace, calls list, outbound call.
- Widget screenshots: Home widget and Lock Screen accessory if configured.
- CarPlay entitlement packet: signed-out prompt, loading/empty, active-call grid, recent callbacks, assistants list, native incoming call via CallKit.

## Release blockers

- [ ] Privacy policy URL and support URL are live and match the submitted app.
- [ ] No placeholder copy, fake prices, or dormant CarPlay claims in metadata.
- [ ] All usage descriptions in `Info.plist` match real runtime behavior.
- [ ] Demo account does not require 2FA, manual approval, or production secrets.
- [ ] PushKit reports incoming calls immediately; non-call notifications use standard APNs, not VoIP pushes.
- [ ] CarPlay entitlement is absent from signed builds until Apple grants it.
- [ ] TestFlight build has been exercised on a physical device for sign-in, outbound call, VoIP inbound call, Siri/App Intents, widgets, and callback number handoff.
