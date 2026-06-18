import SwiftUI

/// Signed-in shell: Home (workspace) + Calls (activity), with the "Ask Wireline"
/// sheet presentable from anywhere via the router (Siri / widget / button).
struct RootTabView: View {
    @EnvironmentObject private var router: WirelineRouter
    @EnvironmentObject private var auth: AuthService

    var body: some View {
        TabView(selection: $router.selectedTab) {
            WorkspaceView()
                .tabItem { Label("Home", systemImage: "house.fill") }
                .tag(WirelineRouter.Tab.home)

            if auth.accountType == "business" {
                CallsView()
                    .tabItem { Label("Calls", systemImage: "phone.fill") }
                    .tag(WirelineRouter.Tab.calls)
                NavigationStack { WalletView() }
                    .tabItem { Label("Wallet", systemImage: "creditcard.fill") }
                    .tag(WirelineRouter.Tab.wallet)
            }

            NavigationStack { SettingsView() }
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
                .tag(WirelineRouter.Tab.settings)
        }
        .tint(Brand.purple)
        .sheet(isPresented: $router.showAsk) { AskWirelineView() }
        // Covers the full screen when the operator answers a CallKit inbound call.
        .fullScreenCover(isPresented: $router.showLiveCall) {
            LiveCallView(callId: router.liveCallId)
                .environmentObject(router)
        }
    }
}
