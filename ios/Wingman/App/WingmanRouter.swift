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
    }

    @Published var showAsk = false

    var route: Route = .workspace {
        didSet { if route == .ask { showAsk = true } }
    }
}
