import SwiftUI

/// Signed-in native shell. The Stitch mobile export informs the compact tab
/// rhythm and visual hierarchy, while the destinations remain real consumer
/// flows: ask, assistants, call recaps, wallet, and settings.
struct RootTabView: View {
    @EnvironmentObject private var router: WirelineRouter

    var body: some View {
        TabView {
            WorkspaceView()
                .tabItem { Label("Studio", systemImage: "slider.horizontal.3") }

            CallsView()
                .tabItem { Label("Recaps", systemImage: "phone.arrow.down.left") }

            NavigationStack { WalletView() }
                .tabItem { Label("Wallet", systemImage: "creditcard") }

            NavigationStack { SettingsView() }
                .tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .tint(Brand.accent)
        .sheet(isPresented: $router.showAsk) { AskWirelineView() }
        .fullScreenCover(isPresented: $router.showLiveCall) {
            LiveCallView(callId: router.liveCallId)
                .environmentObject(router)
        }
    }
}
