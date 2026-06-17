import SwiftUI

/// Signed-in shell: Home (workspace) + Calls (activity), with the "Ask Wireline"
/// sheet presentable from anywhere via the router (Siri / widget / button).
struct RootTabView: View {
    @EnvironmentObject private var router: WirelineRouter
    @EnvironmentObject private var auth: AuthService

    var body: some View {
        TabView {
            WorkspaceView()
                .tabItem { Label("Home", systemImage: "house.fill") }
            
            if auth.accountType == "business" {
                CallsView()
                    .tabItem { Label("Calls", systemImage: "phone.fill") }
                NavigationStack { WalletView() }
                    .tabItem { Label("Wallet", systemImage: "creditcard.fill") }
            }

            NavigationStack { SettingsView() }
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
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
