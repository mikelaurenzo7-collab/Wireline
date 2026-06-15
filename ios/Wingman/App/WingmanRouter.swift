import SwiftUI

/// Bridges App Intents (Siri / Action button / Back Tap / widgets) to in-app
/// UI. When an intent foregrounds the app it sets `route`; the app shell
/// observes it and presents the matching surface.
@MainActor
final class WingmanRouter: ObservableObject {
    static let shared = WingmanRouter()

    enum Route { case workspace, ask }

    @Published var showAsk = false

    /// Driven by CallManager when the user answers a CallKit call. RootTabView
    /// presents LiveCallView as a fullScreenCover while this is true.
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
}
