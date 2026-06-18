import SwiftUI

/// Bridges App Intents (Siri / Action button / Back Tap / widgets) and deep
/// links to in-app UI. When an intent or `wireline://…` URL foregrounds the
/// app it updates the router; the app shell observes it and presents the
/// matching surface.
@MainActor
final class WirelineRouter: ObservableObject {
    static let shared = WirelineRouter()

    enum Route { case workspace, ask }

    /// The signed-in tab surfaces a deep link can select.
    enum Tab: Hashable { case home, calls, wallet, settings }

    @Published var showAsk = false

    /// Selected bottom tab. Driven by widget deep links (`wireline://calls`,
    /// `wireline://wallet`) so a tap lands on the right surface, not just Home.
    @Published var selectedTab: Tab = .home

    /// Driven by CallManager when the user answers a CallKit call. RootTabView
    /// presents LiveCallView as a fullScreenCover while this is true.
    @Published var showLiveCall = false
    @Published var liveCallId: String?

    var route: Route = .workspace {
        didSet { if route == .ask { showAsk = true } }
    }

    /// Handle a `wireline://<host>` deep link from a widget, Control Center
    /// tile, Shortcuts action, or universal link. Hosts mirror the web parity
    /// table in `src/data/personal-mobile.ts` (DEEP_LINKS).
    func handle(url: URL) {
        switch url.host {
        case "ask":
            showAsk = true
        case "calls":
            selectedTab = .calls
        case "wallet":
            selectedTab = .wallet
        case "settings":
            selectedTab = .settings
        default:
            // Unknown host → just foreground on Home.
            selectedTab = .home
        }
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
