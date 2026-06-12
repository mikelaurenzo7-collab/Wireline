# Wireline CarPlay iOS App

Native Swift + SwiftUI implementation for the Wireline CarPlay Agents Widget.

## Phase 3 Updates
- Real backend API integration in CarPlayManager (URLSession + async/await)
- SiriKit intent handler foundation
- CallKit skeleton for incoming call detection and handoff
- Enhanced error handling and security notes

## Setup (Updated for Phase 3)
1. Enable capabilities in Xcode:
   - CarPlay
   - Siri
   - CallKit (for handoff feature)
2. Add required entitlements (see Apple docs for com.apple.developer.siri and CallKit)
3. Configure Info.plist for CarPlay scene delegate
4. Replace placeholder baseURL and auth handling with your production values
5. Test thoroughly in CarPlay Simulator

See main architecture doc for full details and safety guidelines.