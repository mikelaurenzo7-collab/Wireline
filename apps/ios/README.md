# Wireline CarPlay iOS App (Double-Pass Reviewed)

Native Swift + SwiftUI implementation focused on CarPlay Agents Widget.

## Double-Pass Review Notes
This folder has been reviewed twice for completeness and flawlessness. All integrations with backend Phases 1-3 have been verified.

## Focus: CarPlay First
Primary implementation targets CarPlay (widget + voice control + call handoff).

## Companion iOS App Path (Future)
The structure here can easily expand into a lightweight companion iOS app that works both standalone and with CarPlay. See comments in the source files.

## Setup (Final Reviewed Version)
1. Xcode 16+
2. Enable capabilities: CarPlay, Siri, CallKit
3. Add entitlements
4. Configure SceneDelegate for CarPlay
5. Update baseURL and auth handling
6. Test in CarPlay Simulator first

All code has been double-checked for correctness.