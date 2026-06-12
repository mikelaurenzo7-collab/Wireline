# Wireline CarPlay iOS App

Native Swift + SwiftUI implementation for the Wireline CarPlay Agents Widget.

## Setup Instructions
1. Open Xcode 16+ (recommended for 2026).
2. Create a new iOS App project named `WirelineCarPlay` (or add as a target to existing project).
3. Copy the source files from this folder into your project.
4. Enable CarPlay capabilities:
   - Add `CarPlay` framework
   - Add `Siri` and `Voice` capabilities if needed
   - Configure `Info.plist` with CarPlay scene and entitlements (see notes below).
5. Add the `packages/shared` types (or duplicate the relevant interfaces for now).
6. Run on CarPlay Simulator or physical device with CarPlay.

## Project Structure
```
apps/ios/
├─ README.md
├─ Sources/
│   ├─ WirelineCarPlayApp.swift
│   ├─ CarPlaySceneDelegate.swift
│   ├─ Views/
│   │   ├─ CarPlayWidgetView.swift
│   │   └─ VoiceControlView.swift
│   └─ Managers/
│       └─ CarPlayManager.swift
└─ Info.plist notes
```

## Key Features Implemented in Scaffold
- Glanceable widget-style view
- Voice Control template simulation
- Backend integration with Phase 1 APIs
- Placeholder for incoming call handoff

## Design Notes
- Use SwiftUI for modern, clean code.
- Align colors and typography with Aurora Cream design system (light elegant backgrounds, subtle purple accents).
- Prioritize large touch targets and voice-first interaction for driving safety.

## Next Steps
- Wire real Vapi conferencing in backend.
- Add full SiriKit intents.
- Implement actual CallKit handoff.
- Visual QA and CarPlay Simulator testing.

See main `docs/carplay-architecture.md` for full context.