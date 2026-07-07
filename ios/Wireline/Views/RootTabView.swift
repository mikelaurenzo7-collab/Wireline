import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var router: WirelineRouter

    var body: some View {
        TabView(selection: $router.selectedTab) {
            WorkspaceView()
                .tabItem { Label("Command", systemImage: "rectangle.grid.2x2") }
                .tag(WirelineRouter.Tab.workspace)
            AssistantLibraryView()
                .tabItem { Label("Agents", systemImage: "person.2") }
                .tag(WirelineRouter.Tab.agents)
            KnowledgeView()
                .tabItem { Label("Train", systemImage: "book.closed") }
                .tag(WirelineRouter.Tab.train)
            ActionsView()
                .tabItem { Label("Wire", systemImage: "bolt") }
                .tag(WirelineRouter.Tab.wire)
            CallsView()
                .tabItem { Label("Calls", systemImage: "phone.connection") }
                .tag(WirelineRouter.Tab.calls)
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
