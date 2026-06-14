import SwiftUI

/// Bridges App Intents (Siri / Action button / Back Tap / widgets) to in-app
/// UI. When an intent foregrounds the app it sets `route`; the app shell
/// observes it and presents the matching surface.
@MainActor
final class WingmanRouter: ObservableObject {
    static let shared = WingmanRouter()

    enum Route {
        case workspace
        case ask
        case calls
    }

    @Published var showAsk = false

    /// Set when a widget deep-links to `wingman://calls`. `RootTabView` can
    /// observe this to select the Calls tab; until then it's a harmless flag.
    @Published var showCalls = false

    var route: Route = .workspace {
        didSet {
            if route == .ask { showAsk = true }
            if route == .calls { showCalls = true }
        }
    }
}
