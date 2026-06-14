# Wingman — Widget Extension plan

Turn the `WingmanWidgets` extension from a single static launcher into a
glanceable, live, eventually-interactive surface — the iPhone payoff that earns
Wingman its Home/Lock Screen spot. Grounded in the existing iOS app
(`ios/Wingman`), the `/api/mobile/*` backend, and the App Store / CarPlay
runbook in `APP_STORE_CARPLAY_READINESS.md`.

## Architecture

The widget extension has **no auth and no network of its own**. The app fetches
`/api/mobile/*` and writes a small snapshot into a shared **App Group**
(`group.com.wireline.wingman`); the widgets only read it.

```
app  ──fetch /api/mobile/{calls/recent,wallet,calls/active}──►  WidgetSync
WidgetSync ──save snapshot──►  App Group (UserDefaults suite)
                                   ▲                 │
                                   │ load            ▼
WingmanWidgetStore  ◄────────  WingmanWidgets (SnapshotProvider → views)
```

Shared types live in `ios/WingmanShared/WingmanWidgetSnapshot.swift`, compiled
into **both** targets (see `project.yml` source membership). The app refreshes
on launch, on foreground (`scenePhase == .active`), and on sign-in/out, then
calls `WidgetCenter.reloadAllTimelines()`.

## Phase W1 — Shared-data foundation ✅ (this PR)

- App Group capability on the app + widget entitlements
  (`Wingman.entitlements`, `WingmanWidgets.entitlements`).
- `WingmanWidgetSnapshot` + `WingmanWidgetStore` (Codable, App Group suite).
- `WidgetSync` (app-side) fetches recent calls + wallet + active calls and
  writes the snapshot; pre-formats display strings so the widget stays a dumb
  renderer.
- `wingman://calls` deep link wired through `WingmanApp.onOpenURL` →
  `WingmanRouter`.

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

## Phase W3 — Tap-to-act + interactive widgets — in progress

- ✅ **Call back** — each `RecentCallsWidget` row (medium/large) deep-links
  `wingman://callback?number=…`; the app opens the outbound composer
  **prefilled** with that number. A widget tap never auto-dials — the user
  still taps "Place call" (safe + Apple-friendly). This is the #1 everyday/
  driving action in the readiness doc, done via a deep link (no Keychain
  sharing, no call placed from the extension).
- Next: "Mark last call followed up" toggle (interactive `AppIntent`, needs a
  shared Keychain access group so the extension can call `/api/mobile/*`).
- Next: iOS 18 **Control Center** `ControlWidget` (Ask Wingman quick action).

## Phase W4 — Live Activity / Dynamic Island ✅ (this PR)

- `WingmanCallActivityAttributes` (shared) describes an in-progress call;
  `CallLiveActivity` renders the Lock Screen banner + Dynamic Island
  (expanded / compact / minimal) with agent, peer, a live timer, and a phase
  dot (ringing / live / wrapping).
- `CallActivityController` (app) starts / updates / ends the activity
  idempotently; `WidgetSync` reconciles it against the active-calls poll, so a
  live call surfaces on the Lock Screen + Dynamic Island automatically. No-ops
  when Live Activities are disabled. `NSSupportsLiveActivities` added to the app
  Info.plist.
- Tapping the activity opens `wingman://call?id=…` → the app's Calls surface,
  where the user can take the call over.

> **Next refinement:** push-update the activity via APNs Live Activity tokens
> (infra exists in `src/lib/apns-push.ts`) so it updates while backgrounded,
> and drive start/end from `CallManager`/CallKit events rather than only the
> foreground poll.

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
ios/WingmanShared/WingmanWidgetSnapshot.swift   # shared snapshot + App Group store
ios/Wingman/Widgets/WidgetSync.swift            # app-side fetch → snapshot → reload
ios/WingmanWidgets/SnapshotProvider.swift       # shared TimelineProvider
ios/WingmanWidgets/WidgetTheme.swift            # accent + Color(hex:) for the extension
ios/WingmanWidgets/RecentCallsWidget.swift      # W2
ios/WingmanWidgets/NeedsAttentionWidget.swift   # W2
ios/WingmanWidgets/WalletWidget.swift           # W2 (read-only balance)
ios/WingmanWidgets/WingmanWidgetBundle.swift    # register new widgets
ios/WingmanWidgets/WingmanWidgets.entitlements  # App Group (new)
ios/Wingman/Wingman.entitlements                # App Group (added)
ios/Wingman/App/WingmanRouter.swift             # wingman://calls route
ios/Wingman/WingmanApp.swift                    # refresh hook + deep link
ios/project.yml                                 # shared sources + widget entitlements
```
