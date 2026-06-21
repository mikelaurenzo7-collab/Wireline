import SwiftUI

struct AssistantLibraryView: View {
    @State private var agents: [Agent] = []
    @State private var loadError: String?

    var body: some View {
        NavigationStack {
            Group {
                if let loadError {
                    BrandEmptyState(
                        title: "Couldn't load assistants",
                        message: loadError,
                        systemImage: "wifi.exclamationmark"
                    )
                } else if agents.isEmpty {
                    BrandEmptyState(
                        title: "No assistants yet",
                        message: "Create your first assistant on the web, then return here to make calls.",
                        systemImage: "person.wave.2"
                    )
                } else {
                    List(agents) { agent in
                        AgentRow(agent: agent)
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Assistants")
            .wirelineBrand()
            .task { await load() }
            .refreshable { await load() }
        }
    }

    @MainActor private func load() async {
        do {
            agents = try await WirelineAPI.shared.agents()
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }
}
