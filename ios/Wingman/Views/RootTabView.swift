import SwiftUI

/// Signed-in shell: Home (workspace) + Calls (activity), with the "Ask Wingman"
/// sheet presentable from anywhere via the router (Siri / widget / button).
struct RootTabView: View {
    @EnvironmentObject private var router: WingmanRouter

    var body: some View {
        TabView {
            WorkspaceView()
                .tabItem { Label("Home", systemImage: "house.fill") }
            CallsView()
                .tabItem { Label("Calls", systemImage: "phone.fill") }
        }
        .tint(Brand.purple)
        .sheet(isPresented: $router.showAsk) { AskWingmanView() }
    }
}
