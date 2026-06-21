import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var router: WirelineRouter

    var body: some View {
        TabView {
            WorkspaceView()
                .tabItem { Label("Studio", systemImage: "slider.horizontal.3") }

            AssistantLibraryView()
                .tabItem { Label("Assistants", systemImage: "person.2") }

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
