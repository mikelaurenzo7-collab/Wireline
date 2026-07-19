# Wireline mobile + web architecture audit

Date: 2026-06-13

## Core principle

Large consumer apps are rarely single-language systems. The right lesson for Wireline is not to copy any one company stack; it is to keep the user-facing mobile shell native where Apple platform integration matters, keep the web cockpit fast and iteration-friendly, and keep business logic centralized behind shared API contracts.

Wireline should therefore remain a hybrid product at the company level:

- Native Swift / SwiftUI for iPhone, widgets, App Intents, CallKit, PushKit, CarPlay surfaces, and future Apple Watch.
- React / TypeScript / Vite for the web app, public site, operator cockpit, Director, billing, onboarding, and admin workflows.
- Express / Postgres / Drizzle as the system of record, permission boundary, billing boundary, prompt boundary, and mobile contract.

## Current repo read

The repo is already pointed in the right direction. The iOS README explicitly defines Wireline as a thin native client over the existing backend and states that no business logic, prompts, model selection, or billing lives on device. That is the correct architecture for security, speed, and product consistency.

The web app remains the primary operations surface. The root package uses React, Vite, TypeScript, Express, Drizzle, Supabase/Postgres, Vapi, Twilio, Stripe, and verification scripts. The mobile route layer exposes a dedicated `/api/mobile/*` contract while delegating to existing backend primitives instead of duplicating business logic.

## Immediate engineering findings

1. iOS API URL construction needed hardening. Query strings should not be passed as part of a path component. A shared `WirelineConfig.url(path:queryItems:)` builder was added, and `WirelineAPI.recentCalls(limit:)` now sends `limit` as a true query item.

2. The iOS app should stay native-first. SwiftUI gives the product first-class access to App Intents, widgets, CallKit, PushKit, system navigation, accessibility, and CarPlay. React Native is not the best first move for Wireline because the product advantage is deep OS integration, not generic cross-platform screens.

3. The backend/mobile contract is the moat. The iOS app should remain a premium remote control for the same fleet the web app manages. The server should own prompts, model policy, spend controls, TCPA/DNC compliance, entitlements, device registration, and every mutating action.

4. Android should come after contract stabilization, not before. Build Android when `/api/mobile/me`, `/api/mobile/agents`, `/api/mobile/calls/*`, `/api/mobile/wallet`, push notification behavior, and handoff semantics are proven on iOS. Android should consume the same mobile contract with Kotlin/Jetpack Compose rather than introducing a second backend path.

5. Web cleanup remains important. The app should avoid framework drift. The production stack is Express/Vite, so any stale Next-style routes or placeholder code should be removed rather than left as confusing surface area.

## Product direction

### iOS next

- Finish TestFlight readiness around signing, APNs, App Groups, PushKit physical-device testing, and a small manual QA matrix.
- Keep CarPlay as a gated enhancement, not the main launch bet.
- Make the everyday phone flow the hero: Siri, Action Button instructions, widgets, recent calls, take-this-call, and outbound “call for me” moments.
- Add resilient error presentation around auth expiry, mobile rate limits, invalid phone numbers, handoff unavailable, and push registration failure.

### Web next

- Keep Agent Studio / Wireline Wizard as the main builder.
- Keep Director as fleet operator, QA coach, and strategic layer.
- Continue using the web app for setup, billing, integrations, compliance settings, agent training, and analytics.
- Maintain the Wireline Letterpress design system as the shared brand substrate: obsidian/near-white canvas, restrained neutrals, electric-violet action (Aurora palette), and platform-native expression on iOS.

### Android next

- Do not port the UI blindly.
- Build a Kotlin/Jetpack Compose app after iOS contract maturity.
- Start with login, workspace bootstrap, agents list, recent calls, active calls, push notifications, wallet read-only, and handoff.
- Avoid CarPlay-equivalent distractions until the core phone behavior works.

## Success criteria

Wireline wins if the mobile app feels like a native Apple utility while the web app feels like an enterprise command center. The shared backend should make every platform feel like one product, not disconnected rewrites.
