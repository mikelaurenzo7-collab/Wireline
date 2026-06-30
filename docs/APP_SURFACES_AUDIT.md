# Wireline app-surface audit

This audit covers the non-root application surfaces inside the Wireline monorepo. The goal is not to turn every surface into a separate product. The goal is to keep each client thin, intentional, and aligned with the same server-owned agent platform.

## Product hierarchy

Wireline has one operating system and several controlled surfaces.

1. **Web workspace** — full setup, training, billing, integrations, review, and launch.
2. **Native mobile** — daily Run surface for calls, recaps, approvals, callback handoff, widgets, Siri/App Intents, push, and native call surfaces.
3. **Wireline Command browser extension** — user-initiated browser context handoff into Studio. It is not a background scraper or autonomous browser agent.
4. **ChatGPT App / MCP** — account-bound private agent drafting and private simulation. No launch, calling, messaging, billing, or external mutations.
5. **Android Auto / CarPlay / widgets** — native OS re-entry and communication affordances, entitlement-gated where applicable.

## Current surface audit

| Surface | Current repo root | Readiness | What matters most next |
| --- | --- | --- | --- |
| Web/API | `src/`, `server.ts`, `api/` | Launch spine | Keep as Vercel root until CI can reproduce a split web/API build. |
| Browser extension | `apps/browser-extension/` | Preview/packageable | Keep active-tab-only privacy posture; store artifacts after real browser QA. |
| iOS | `ios/` | Native scaffold with widgets and CallKit plan | Verify XcodeGen, App Group, PushKit, and device-only flows on hardware. |
| Android | `android/` | Native scaffold with Compose, FCM, Telecom plan | Verify Gradle sync, Firebase setup, and physical-device Telecom/FCM flows. |
| ChatGPT App | `src/routes/chatgpt-mcp-*`, `src/lib/chatgpt-mcp-*`, `api/mcp.ts` | Account-bound draft surface | Keep draft-only until a separate launch/action review expands scope. |

## Execution completed in this pass

- Browser Command quick jumps now target canonical workspace routes directly:
  - Agents -> `/studio`
  - Training -> `/knowledge`
  - Integrations -> `/connections`
  - Usage -> `/settings/billing`
- Browser-extension contract test now blocks stale redirect aliases like `/agents` and `/actions`.
- iOS primary tab now uses **Run** instead of Command.
- iOS workspace title and metric heading now use **Run** / **Run the line** language.
- Android primary tab now uses **Run** instead of Command.
- Android metric heading now uses **RUN THE LINE**.
- Android agent rows no longer claim every agent is `Ready`; they show `Voice set` only when the returned agent has a voice, otherwise `Training`.
- Native contract test now locks the Run language and truthful Android agent status behavior.

## Non-negotiable boundaries

- No client stores provider keys, billing authority, OAuth secrets, system prompts, or model routing logic.
- No client launches calls, sends messages, provisions numbers, or mutates integrations without server-side confirmation and entitlement checks.
- Browser Command never receives broad host permissions or persistent content scripts.
- ChatGPT App remains private, account-bound, and draft/simulation-only until a deliberate product/security review expands its action surface.
- Native apps stay native: SwiftUI/CallKit/PushKit/App Intents on iOS and Kotlin/Compose/Telecom/FCM on Android.

## Next execution order

1. **Browser extension QA**
   - Run `node apps/browser-extension/scripts/build.mjs --check` and package Chromium/Firefox artifacts.
   - Manual browser smoke: toolbar open, side panel/sidebar, selected text, `tel:` link, restricted page behavior, Studio fragment import/removal.
   - Capture Chrome/Edge/Opera/Firefox store screenshots only after UI is stable.

2. **iOS hardware pass**
   - `cd ios && xcodegen generate`.
   - Validate sign-in, Keychain token reuse, App Group widget snapshot, PushKit incoming call, CallKit handoff, and App Intents on a physical device.
   - Treat CarPlay Communication as entitlement-gated; do not market it as live until Apple grants approval.

3. **Android hardware pass**
   - Open `android/` in Android Studio and sync Gradle.
   - Add `google-services.json` locally, confirm FCM envs in Vercel, then test sign-in, FCM registration, inbound call surface, and handoff on a physical device.
   - Keep Android Auto messaging strictly within platform eligibility and Telecom behavior.

4. **ChatGPT App release pass**
   - Run `node scripts/check-chatgpt-app-release.mjs --url https://trywireline.com`.
   - Test OAuth with a real reviewer account.
   - Exercise create, update, list, private simulation, and negative safety prompts.
   - Keep launch, phone numbers, payments, and external actions out of the ChatGPT transport.

5. **Monorepo extraction later, not now**
   - Do not move root web/API into `apps/web` until root build, auth, CSP, tests, and server smoke can run cleanly as an independent package boundary.
   - First extract shared contracts and brand artifacts; never extract business behavior into a client package.

## Launch-readiness lens

A surface is launch-ready only when it has:

- a clear user job,
- no fake data or fake readiness,
- a stable auth boundary,
- a release-specific build command,
- a manual smoke checklist,
- and a contract test guarding its sharpest product/security boundary.
