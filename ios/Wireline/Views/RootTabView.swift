import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var router: WirelineRouter

    var body: some View {
        TabView {
            WorkspaceView().tabItem { Label("Studio", systemImage: "square.grid.2x2") }
            AssistantLibraryView().tabItem { Label("Agents", systemImage: "person.2") }
            KnowledgeView().tabItem { Label("Train", systemImage: "book.closed") }
            ActionsView().tabItem { Label("Wire", systemImage: "bolt") }
            CallsView().tabItem { Label("Recaps", systemImage: "tray.full") }
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
