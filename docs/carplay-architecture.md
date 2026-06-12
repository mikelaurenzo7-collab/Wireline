# Wireline CarPlay Agents Widget - Architecture & Implementation

**Status**: Double-Pass Review Complete (Phases 1-3) – Scope: iOS App + CarPlay
**Branch**: feature/carplay-agents-widget
**Updated**: 2026-06-12

## Scope Clarification
User clarified: Build for **both iPhone (standalone companion app) and CarPlay**.

Primary focus remains CarPlay, but the iOS project is structured as a proper companion app that works on iPhone and extends to CarPlay.

## Double-Pass Review (Updated Scope)
A second thorough review was conducted after the clarification.

### Key Findings & Improvements
- **Phase 1 Backend**: Already well-suited for both clients. Minor improvements to documentation for multi-client support.
- **Phase 2 iOS**: Enhanced structure to clearly separate iPhone UI and CarPlay-specific code. Added basic standalone iPhone views as foundation.
- **Phase 3 Wiring**: Networking, Siri, and CallKit work for both contexts. Added notes on shared logic.
- Overall: Improved project organization recommendations and added guidance for expanding the iPhone app UI.

## Recommended iOS Project Structure (for both iPhone + CarPlay)
```
apps/ios/
├─ Wireline (iPhone App target)
├─ WirelineCarPlay (CarPlay extension / scene)
├─ Shared/
│   ├─ Managers/
│   └─ Views/ (shared components)
└─ CarPlay-specific/
```

This allows a full companion iPhone app while delivering excellent CarPlay support.

---
[All previous content remains valid. The architecture supports both platforms cleanly.]