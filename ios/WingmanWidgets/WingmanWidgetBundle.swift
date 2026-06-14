import SwiftUI
import WidgetKit

@main
struct WingmanWidgetBundle: WidgetBundle {
    var body: some Widget {
        // Static launcher (no shared data needed).
        AskWingmanWidget()
        // Data-backed glanceable widgets (read the App Group snapshot).
        RecentCallsWidget()
        NeedsAttentionWidget()
        WalletWidget()
    }
}
