import SwiftUI

struct RootTabView: View {
    @EnvironmentObject private var router: WirelineRouter

    var body: some View {
        TabView {
            WorkspaceView().tabItem { Label("Studio", systemImage: "slider.horizontal.3") }
            AssistantLibraryView().tabItem { Label("Assistants", systemImage: "person.2") }
            KnowledgeView().tabItem { Label("Knowledge", systemImage: "book.closed") }
            ActionsView().tabItem { Label("Actions", systemImage: "bolt") }
            CallsView().tabItem { Label("Recaps", systemImage: "phone.arrow.down.left") }
        }
        .tint(Brand.accent)
        .sheet(isPresented: $router.showAsk) { AskWirelineView() }
        .fullScreenCover(isPresented: $router.showLiveCall) {
            LiveCallView(callId: router.liveCallId).environmentObject(router)
        }
    }
}
