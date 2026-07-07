import SwiftUI

/// Bridges App Intents, widgets, and CallKit into focused native surfaces.
@MainActor
final class WirelineRouter: ObservableObject {
    static let shared = WirelineRouter()

    enum Tab: Hashable {
        case workspace
        case agents
        case train
        case wire
        case calls
    }

    @Published var selectedTab: Tab = .workspace
    @Published var showAsk = false
    @Published var showWallet = false
    @Published var showLiveCall = false
    @Published var liveCallId: String?
    /// When true, LiveCallView attempts handoff immediately (CallKit answer path).
    @Published var liveCallAutoHandoff = false

    func presentLiveCall(callId: String?, autoHandoff: Bool = false) {
        liveCallId = callId
        liveCallAutoHandoff = autoHandoff
        showLiveCall = true
    }

    func dismissLiveCall() {
        showLiveCall = false
        liveCallId = nil
        liveCallAutoHandoff = false
    }

    /// Handles deep links from widgets, Live Activity, and Siri shortcuts.
    /// `wireline://call/<call-id>` opens the existing handoff-capable call view.
    /// Widgets use `wireline://ask`, `wireline://calls`, `wireline://wallet`,
    /// and `wireline://agents` to deep-link into the matching tab or surface.
    func open(url: URL) {
        switch url.host {
        case "ask":
            showAsk = true
        case "call":
            let callId = url.pathComponents.dropFirst().first
            presentLiveCall(callId: callId)
        case "calls":
            selectedTab = .calls
        case "wallet":
            selectedTab = .workspace
            showWallet = true
        case "agents":
            selectedTab = .agents
        default:
            break
        }
    }
}
