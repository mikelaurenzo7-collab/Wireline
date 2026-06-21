import WidgetKit
import SwiftUI

@main
struct WirelineWidgetBundle: WidgetBundle {
    var body: some Widget {
        AskWirelineWidget()
        AssistantWidget()
        NeedsAttentionWidget()
        WalletWidget()
        if #available(iOS 16.1, *) {
            WirelineCallLiveActivity()
        }
    }
}
