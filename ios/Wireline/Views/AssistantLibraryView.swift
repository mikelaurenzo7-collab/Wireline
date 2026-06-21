import SwiftUI

struct AssistantLibraryView: View {
    @State private var agents: [Agent] = []
    @State private var loadError: String?
    @State private var showCreate = false
    @State private var name = ""
    @State private var role = "scheduler"
    @State private var isCreating = false
    @State private var creationError: String?

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
                        title: "Start with one assistant",
                        message: "Give it a name and a clear job. You can teach the details in Studio afterward.",
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
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Create assistant")
                }
            }
            .sheet(isPresented: $showCreate) { createSheet }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private var createSheet: some View {
        NavigationStack {
            Form {
                Section("Start with one clear job") {
                    TextField("Name", text: $name)
                    Picker("Help with", selection: $role) {
                        Text("Personal assistant").tag("scheduler")
                        Text("Helpful caller").tag("customer_service")
                        Text("Call concierge").tag("receptionist")
                        Text("Something else").tag("custom")
                    }
                }
                Section {
                    Button {
                        Task { await create() }
                    } label: {
                        if isCreating {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Label("Create assistant", systemImage: "wand.and.stars")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Brand.accent)
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isCreating)
                }
                if let creationError {
                    Section { Text(creationError).foregroundStyle(Brand.destructive) }
                }
            }
            .navigationTitle("New assistant")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showCreate = false }
                }
            }
        }
        .presentationDetents([.medium])
    }

    @MainActor private func load() async {
        do {
            agents = try await WirelineAPI.shared.agents()
            loadError = nil
        } catch {
            loadError = error.localizedDescription
        }
    }

    @MainActor private func create() async {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { return }
        isCreating = true
        creationError = nil
        defer { isCreating = false }
        do {
            let agent = try await MobileAssistantCreation.create(name: cleanName, role: role)
            agents.insert(agent, at: 0)
            name = ""
            showCreate = false
            await load()
        } catch {
            creationError = error.localizedDescription
        }
    }
}
