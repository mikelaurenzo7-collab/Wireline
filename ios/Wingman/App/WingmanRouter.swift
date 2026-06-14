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

    /// "Call back" deep link (`wingman://callback?number=…`): presents the
    /// outbound composer prefilled with this number. Nil clears it.
    @Published var showCallback = false
    var callbackNumber: String?

    var route: Route = .workspace {
        didSet {
            if route == .ask { showAsk = true }
            if route == .calls { showCalls = true }
        }
    }

    /// Open the outbound composer prefilled to call a number back.
    func requestCallback(number: String) {
        callbackNumber = number
        showCallback = true
    }
}
