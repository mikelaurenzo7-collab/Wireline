# Hands-free BotBound

## Product direction

Take your bot with you. Hands-free is another input/output surface for the same owned Bot, private Memory, task history and server-owned actions. Keep it inside Studio and the existing plans, with normal task/model usage accounting. Hardware does not create a separate Bot or grant additional permissions.

The first release candidate adds foreground English speech input and device-voice readouts to Studio's work and owner-chat composers, plus shared MCP connector tools. Meta approval, physical Bluetooth routing, native background sessions and cloned-voice owner conversations are not certified by this implementation.

## Opportunity and implementation map

| Surface | Useful workflow | Implementation / next evidence |
| --- | --- | --- |
| Phone browser + earbuds/headset | Dictate, hear the draft, submit deliberately, hear a new reply, capture a private note | Foreground Web Speech controller implemented; physical routing/noise acceptance remains |
| Phone audio through glasses | Talk on an existing Bot phone line | Existing customer-call transport; private owner access requires a separate authenticated owner mode |
| Meta AI Connector | Aggregate briefing, confirmed private note, review-only task handoff | Shared `/mcp` tools prepared; Meta preview acceptance and actual OAuth client/callback still required |
| Meta Ray-Ban Display web app | Compact task status and deliberate approvals | Future small interface; ordinary Ray-Ban Meta glasses do not have this display |
| Meta Device Access Toolkit | Direct glasses speech/audio and deliberate photo capture tied to a task/note | Future native adapter with device permissions; connector support does not establish device access |
| Native iOS/Android + Bluetooth | Walk-and-talk session through screen lock, OS routing, interruptions | Separate platform builds, signing and physical-device acceptance; reuse server contracts |
| Siri / Android shortcuts | Deliberately start the selected Bot/session | Reuse native intents; verify eligibility and authentication on locked devices |
| Car audio | Short briefing, dictated follow-up, completion readout | Prefer OS communication routes; native outbound, CarPlay and Android Auto retain existing eligibility/release gates |
| Headset buttons / wearable triggers | Start, pause, resume an explicitly chosen session | OS/device dependent; pairing does not grant universal button or wake-word ownership |
| Spanish / bilingual | Field notes, briefings and follow-up | Future localized grammar and recognition language; test accents and code switching. Current commands are English |

Prioritize repeated owner jobs: unread-work briefing, job-site/property notes, research and drafted follow-up. Prove a daily workflow before another app shell, subscription or device-specific product. A field professional can capture observations and assign follow-up while moving between jobs; the resulting work stays in Studio.

## Foreground Studio contract

1. Open Hands-free beside the real composer, pair the device in OS settings and choose Check audio. Playback completion does not prove the wearer heard it or that a particular Bluetooth route is active. Check the microphone too.
2. Start listening explicitly. Navigation and handoff links never activate the microphone. Recognition uses the browser/device speech service, which may process audio remotely under its own policies. It is separate from BotBound's server models and ElevenLabs cloning.
3. Final utterances append to the current draft. Standalone `send task` (browser work) or `send message` (owner chat) submits through the existing workflow. Embedded phrases remain dictated text. No speech command approves outbound communication or bypasses a browser checkpoint.
4. `save note` saves the exact draft to private owner Memory, retaining the existing 500-character and 20-note bounds. It is never customer Training or action authority. Announce success only after the receipt confirms that content. Ambiguous failures retain the draft and never retry automatically.
5. `read draft`, `clear draft` and `stop listening` affect this session/draft. Ending hands-free does not cancel work already submitted.
6. Recognition stops during readouts and while the Bot works. Speak each new response once during the opted-in session; never automatically read an old response at startup. Bound readouts and disclose truncation.
7. End after five minutes overall or one minute of silence. Permission startup has a 15-second deadline. Pause on hidden/page-exit events and reported device changes, requiring explicit restart. Unsupported browsers retain typing/keyboard dictation.
8. Recheck readiness at confirmation, preserve the existing duplicate-request fence and newer edits, and invalidate old microphone/playback/async callbacks on Bot/account changes.

Web Bluetooth is not an audio-routing API. Never use `requestDevice` to promise headset audio. The OS/browser chooses Web Speech's microphone and output. This implementation does not infer a device from its name, promise an HFP/LE Audio codec, or claim screen-lock listening. `devicechange` is a useful stop signal but cannot detect every OS route change. Real-device acceptance must check intended input/output and disconnect during playback.

## Connector and Meta onboarding

Reuse `https://botbound.app/mcp` and the existing OAuth protected-resource and authorization-server metadata. Provider secrets stay server-side.

| Intent | Tool | Minimum scope | Result |
| --- | --- | --- | --- |
| Brief me | `get_botbound_workspace_summary` | `agents.read` | Existing aggregate activity/unread counts; no customer bodies, numbers or recordings |
| Choose my Bot | `list_botbound_agents` | `agents.read` | Existing owned Bot identifiers/names |
| Remember this privately | `save_botbound_private_note` | `notes.write` | Exact confirmed note through the same tenant-scoped, locked, retry-deduplicated Memory writer as Studio |
| Give my Bot a task | `prepare_botbound_task` | `agents.read` | Owned-Bot review URL; no task dispatch, browser, spend or outreach |

`notes.write` is absent from default scopes. Existing grants never gain it implicitly. Request it explicitly at OAuth consent and confirm every exact note. Apps describes the permission; grant revocation/account deletion remain effective. Private notes are separate from the off-by-default customer Training permission.

A handoff encodes inert task text in a URL fragment, outside HTTP requests/Referrer headers. That text is still present in the link and can be retained by a host conversation or browser history: never include passwords, codes or payment credentials. Studio consumes/removes the fragment, preserves an existing draft, and never automatically starts/replies to work. An account cannot admit another account's Bot. Server admission and billing remain authoritative.

Meta preview entry: https://dev.meta.ai/products/connectors. Describe a small-business/field-work assistant for aggregate briefings, confirmed private notes and handing work to the existing Studio. Preview access is limited; public publishing is a later phase. This implementation has not applied or obtained acceptance.

Availability checked against Meta's documentation on November 7, 2026: Meta AI Connectors remain in developer preview, while Device Access Toolkit 1.0 is a stable release that began rolling out September 30, 2026. The native toolkit supports speech/audio and camera capabilities across supported display and displayless glasses; availability varies by device and market. It provides a direct native integration path independently of connector preview selection. Display web apps remain specific to Meta Ray-Ban Display. These are platform capabilities, not features already shipped by BotBound.

After acceptance, obtain Meta's actual client identifier, callback, supported schemas and OAuth requirements. Review exact-client/exact-callback configuration while preserving existing clients. Do not guess callbacks, enable wildcard Meta domains or trust a lookalike hostname. Test PKCE S256, audience/resource binding, state, consent, new-user linking, insufficient scopes, refresh, revocation and account deletion. Advertise compatibility only after a linked-account on-glasses run succeeds. A Meta connector invokes our tools; it does not establish custom ElevenLabs playback through Meta AI.

## Native and owner-phone milestones

Preserve the SwiftUI and Kotlin apps. On iOS, use an appropriate `AVAudioSession` voice-chat configuration with Bluetooth HFP input, route observation and interruptions. On Android, use Telecom endpoints or `AudioManager.setCommunicationDevice`, clearing route requests on teardown. Avoid deprecated SCO toggles. Require hardware acceptance for audio focus, interruptions, disconnects, lifecycle, permissions, expiry, sign-out and screen lock.

Build the native path in this order:

1. Add a deliberately started owner speech session in the existing mobile apps, retaining the same Bot, drafts, notes and server admission rules. Prove headset routing and interruptions before background operation. Recognition and playback transports may change; action authority does not.
2. Add a Device Access Toolkit adapter for supported glasses speech/audio. Keep device pairing and permissions separate from BotBound account authentication. Test with Meta's mock devices, then real hardware; simulated audio does not certify a route or wake-word behavior.
3. Add deliberate single-photo context and a compact status/review surface on compatible displays. Treat captured content as untrusted task input, preserve existing upload/access rules and keep private details out of ambient notifications. Never infer camera permission from an MCP grant or start continuous recording from a task link.
4. Add background/screen-lock sessions and OS shortcuts only after platform eligibility, lifecycle, sign-out, interruption and physical-device checks pass. Keep an explicit end control and bounded sessions on every surface.

A private owner session over PSTN needs separate admission. Caller ID is not ownership proof. Require an expiring account-bound pairing challenge, bind the verified session to the owner/Bot, apply spend/deadline/deletion fences and separate owner Memory from customer-call prompts. Outbound/SMS/email retain recipient permission and review. Never grant owner powers to an ordinary inbound caller.

## Acceptance and sources

Automated checks cover no automatic start/send, command parsing, half-duplex echo isolation, timers, bounded notes, failure receipts, duplicate/late events, Bot switching, changing draft limits, handoff review, scopes/tenancy, terminal deletion and mobile/desktop presentation. Mocked speech proves control flow, not speech accuracy or Bluetooth routing.

Before release, pass full repository checks and the exact-source Render process. Then test real iPhone/Android headsets and supported Meta glasses: input/output, noise accuracy, reconnect, fallback after disconnect, phone-call interruption, screen lock, permission denial and action confirmation. Measure task success/time, accidental submissions, microphone cleanup, battery and normal task/model costs. Keep browser, native and Meta approval claims distinct.

- Meta connectors: https://dev.meta.ai/products/connectors
- Meta developer FAQ: https://developers.meta.com/wearables/faq/
- Meta Device Access Toolkit: https://developers.meta.com/wearables/device-access-toolkit/
- Browser audio output: https://developer.mozilla.org/en-US/docs/Web/API/Audio_Output_Devices_API
- Web speech: https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
- iOS Bluetooth HFP: https://developer.apple.com/documentation/avfaudio/avaudiosession/categoryoptions-swift.struct/allowbluetoothhfp
- Android routing: https://developer.android.com/reference/android/media/AudioManager#setCommunicationDevice(android.media.AudioDeviceInfo)
