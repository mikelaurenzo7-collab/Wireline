import SwiftUI

/// Bridges App Intents, widgets, and CallKit into focused native surfaces.
@MainActor
final class WirelineRouter: ObservableObject {
    static let shared = WirelineRouter()

    enum Route { case workspace, ask }

    @Published var showAsk = false
    @Published var showLiveCall = false
    @Published var liveCallId: String?
    /// When true, LiveCallView attempts handoff immediately (CallKit answer path).
    @Published var liveCallAutoHandoff = false

    var route: Route = .workspace {
        didSet { if route == .ask { showAsk = true } }
    }

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

    /// Handles deep links from the active-call Live Activity / Dynamic Island.
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
            route = .workspace
        case "wallet":
            route = .workspace
        case "agents":
            route = .workspace
        default:
            break
        }
    }
}
