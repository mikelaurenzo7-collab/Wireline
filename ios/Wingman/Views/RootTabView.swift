import SwiftUI

/// Signed-in shell: Home (workspace) + Calls (activity), with the "Ask Wingman"
/// sheet presentable from anywhere via the router (Siri / widget / button).
struct RootTabView: View {
    @EnvironmentObject private var router: WingmanRouter
    @State private var agents: [Agent] = []
    @State private var selection: Tab = .home

    private enum Tab: Hashable { case home, calls }

    var body: some View {
        TabView(selection: $selection) {
            WorkspaceView()
                .tag(Tab.home)
                .tabItem { Label("Home", systemImage: "house.fill") }
            CallsView()
                .tag(Tab.calls)
                .tabItem { Label("Calls", systemImage: "phone.fill") }
        }
        .tint(Brand.purple)
        .sheet(isPresented: $router.showAsk) { AskWingmanView() }
        // "Call back" from a recent-call widget → prefilled outbound composer.
        // The user still taps "Place call" — a widget tap never auto-dials.
        .sheet(isPresented: $router.showCallback) {
            OutboundCallView(agents: agents, prefillNumber: router.callbackNumber)
        }
        // wingman://calls and wingman://call?id=… (widgets + in-call Live
        // Activity) land on the Calls tab. Consume the flag once handled.
        .onChange(of: router.showCalls) { _, show in
            if show {
                selection = .calls
                router.showCalls = false
            }
        }
        // Cold launch via a deep link: the flag is already set before the first
        // onChange, so consume it once on appear too.
        .onAppear {
            if router.showCalls {
                selection = .calls
                router.showCalls = false
            }
        }
        .task {
            if agents.isEmpty { agents = (try? await WingmanAPI.shared.agents()) ?? [] }
        }
    }
}
