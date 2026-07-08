# Wireline — Widget Extension plan

Turn the `WirelineWidgets` extension from a single static launcher into a
glanceable, live, eventually-interactive surface — the iPhone payoff that earns
Wireline its Home/Lock Screen spot. Grounded in the existing iOS app
(`ios/Wireline`), the `/api/mobile/*` backend, and the App Store / CarPlay
readiness runbook in `APP_STORE_CARPLAY_READINESS.md`. Widgets stay companion
scoped: authenticated status, active/recent calls, follow-up count, and read-only
wallet balance. They must not introduce billing checkout, CRM setup, campaign
management, or long-form agent training flows.

## Architecture

The widget extension has **no auth and no network of its own**. The app fetches
`/api/mobile/*` and writes a small snapshot into a shared **App Group**
(`group.com.wireline.assistant`); the widgets only read it.

```
app  ──fetch /api/mobile/{calls/recent,wallet,calls/active}──►  WidgetSync
WidgetSync ──save snapshot──►  App Group (UserDefaults suite)
                                    ▲                 │
                                    │ load            ▼
WirelineWidgetStore  ◄────────  WirelineWidgets (SnapshotProvider → views)
```

Shared types live in `ios/WirelineShared/WirelineWidgetSnapshot.swift`, compiled
into **both** targets (see `project.yml` source membership). The app refreshes
on launch, on foreground (`scenePhase == .active`), and on sign-in/out, then
calls `WidgetCenter.reloadAllTimelines()`.

## Phase W1 — Shared-data foundation ✅ (this PR)

- App Group capability on the app + widget entitlements
  (`Wireline.entitlements`, `WirelineWidgets.entitlements`).
- `WirelineWidgetSnapshot` + `WirelineWidgetStore` (Codable, App Group suite).
- `WidgetSync` (app-side) fetches recent calls + wallet + active calls and
  writes the snapshot; pre-formats display strings so the widget stays a dumb
  renderer.
- `wireline://calls` deep link wired through `WirelineApp.onOpenURL` →
  `WirelineRouter`.

## Phase W2 — Live glanceable widgets ✅ (this PR)

- `RecentCallsWidget` (`systemSmall` / `medium` / `large`): latest calls with
  direction + sentiment dot + follow-up marker; deep-links to Calls.
- `NeedsAttentionWidget` (`systemSmall` + Lock Screen `accessoryRectangular` /
  `accessoryInline` / `accessoryCircular`): follow-up counter.
- `WalletWidget` (`systemSmall` + Lock Screen accessories): prepaid credit
  balance. Read-only — top-ups stay on the web (Stripe), so it never touches
  Apple's IAP surface.
- All read the snapshot, degrade gracefully (signed-out / empty states), and
  refresh on a 15-min backstop plus app-driven reloads.

> **Build note:** authored against the repo's XcodeGen setup; verify in Xcode
> (`cd ios && xcodegen generate`) — there's no macOS/Xcode in CI here. After
> regenerating, the App Group must exist in the Apple Developer portal and be
> selected in both targets' Signing & Capabilities.

## Phase W3 — Interactive widgets (iOS 17 AppIntent buttons) — next

- "Call back last missed" `AppIntent` button on `RecentCallsWidget` (no app
  launch) — maps to the #1 future intent in the readiness doc and must pass the
  same safe outbound-call purpose/consent contract as the app.
- "Mark last call followed up" toggle only after a narrow mobile endpoint exists
  for that specific status change; do not add CRM workflows to the widget.
- iOS 18 **Control Center** `ControlWidget`: Ask Wireline + call-back toggles,
  still limited to explicit user-initiated actions.

## Phase W4 — Live Activity / Dynamic Island — next

- `ActivityKit` `WirelineCallActivity`: live active-call status + one-tap
  "Take this call" handoff (reuses `WirelineAPI.handoffCall`). Updated via APNs
  Live Activity tokens (push infra already exists in `src/lib/apns-push.ts`).

## Phase W5 — App Store submission

- Add the App Group + widget App ID capabilities in the portal.
- Refresh Privacy Nutrition Labels for any data surfaced in widgets.
- Capture Home + Lock Screen widget screenshots for the listing (the readiness
  doc already lists these).

## Phase C1 — CarPlay (entitlement-gated, already scaffolded)

- Submit the Communication entitlement packet (drafted in the readiness doc).
- Add a "call back last missed" CarPlay action; capture the screenshot set.

## Files in this PR

```
ios/WirelineShared/WirelineWidgetSnapshot.swift   # shared snapshot + App Group store
ios/Wireline/Widgets/WidgetSync.swift            # app-side fetch → snapshot → reload
ios/WirelineWidgets/SnapshotProvider.swift       # shared TimelineProvider
ios/WirelineWidgets/WidgetTheme.swift            # accent + Color(hex:) for the extension
ios/WirelineWidgets/RecentCallsWidget.swift      # W2
ios/WirelineWidgets/NeedsAttentionWidget.swift   # W2
ios/WirelineWidgets/WalletWidget.swift           # W2 (read-only balance)
ios/WirelineWidgets/WirelineWidgetBundle.swift    # register new widgets
ios/WirelineWidgets/WirelineWidgets.entitlements  # App Group (new)
ios/Wireline/Wireline.entitlements                # App Group (added)
ios/Wireline/App/WirelineRouter.swift             # wireline://calls route
ios/Wireline/WirelineApp.swift                    # refresh hook + deep link
ios/project.yml                                 # shared sources + widget entitlements
```
