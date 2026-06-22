import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var router: WirelineRouter

    var body: some View {
        TabView {
            WorkspaceView().tabItem { Label("Overview", systemImage: "square.grid.2x2") }
            AssistantLibraryView().tabItem { Label("Assistants", systemImage: "person.2") }
            CallsView().tabItem { Label("Inbox", systemImage: "tray.full") }
            KnowledgeView().tabItem { Label("Knowledge", systemImage: "book.closed") }
            SettingsView().tabItem { Label("Settings", systemImage: "gearshape") }
        }
        .tint(Brand.accent)
        .toolbarBackground(Brand.panel, for: .tabBar)
        .toolbarBackground(.visible, for: .tabBar)
        .sheet(isPresented: $router.showAsk) { AskWirelineView() }
        .fullScreenCover(isPresented: $router.showLiveCall) {
            LiveCallView(callId: router.liveCallId).environmentObject(router)
        }
    }
}
