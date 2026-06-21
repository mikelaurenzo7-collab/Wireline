import SwiftUI

/// Bridges App Intents, widgets, and CallKit into focused native surfaces.
@MainActor
final class WirelineRouter: ObservableObject {
    static let shared = WirelineRouter()

    enum Route { case workspace, ask }

    @Published var showAsk = false
    @Published var showLiveCall = false
    @Published var liveCallId: String?

    var route: Route = .workspace {
        didSet { if route == .ask { showAsk = true } }
    }

    func presentLiveCall(callId: String?) {
        liveCallId = callId
        showLiveCall = true
    }

    func dismissLiveCall() {
        showLiveCall = false
        liveCallId = nil
    }

    /// Handles deep links from the active-call Live Activity / Dynamic Island.
    /// `wireline://call/<call-id>` opens the existing handoff-capable call view.
    func open(url: URL) {
        switch url.host {
        case "ask":
            showAsk = true
        case "call":
            let callId = url.pathComponents.dropFirst().first
            presentLiveCall(callId: callId)
        default:
            break
        }
    }
}
