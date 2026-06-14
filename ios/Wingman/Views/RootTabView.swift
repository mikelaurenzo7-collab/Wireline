import SwiftUI

/// Signed-in shell: Home (workspace) + Calls (activity), with the "Ask Wingman"
/// sheet presentable from anywhere via the router (Siri / widget / button).
struct RootTabView: View {
    @EnvironmentObject private var router: WingmanRouter
    @State private var agents: [Agent] = []

    var body: some View {
        TabView {
            WorkspaceView()
                .tabItem { Label("Home", systemImage: "house.fill") }
            CallsView()
                .tabItem { Label("Calls", systemImage: "phone.fill") }
        }
        .tint(Brand.purple)
        .sheet(isPresented: $router.showAsk) { AskWingmanView() }
        // "Call back" from a recent-call widget → prefilled outbound composer.
        // The user still taps "Place call" — a widget tap never auto-dials.
        .sheet(isPresented: $router.showCallback) {
            OutboundCallView(agents: agents, prefillNumber: router.callbackNumber)
        }
        .task {
            if agents.isEmpty { agents = (try? await WingmanAPI.shared.agents()) ?? [] }
        }
    }
}
