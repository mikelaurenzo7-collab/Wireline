import SwiftUI

struct AssistantLibraryView: View {
    @State private var agents: [Agent] = []
    @State private var agentRoles: [AgentRole] = []
    @State private var rolesLoading = false
    @State private var loadError: String?
    @State private var showCreate = false
    @State private var name = ""
    @State private var role = "scheduler"
    @State private var isBusinessAgent = false
    @State private var isCreating = false
    @State private var creationError: String?

    var body: some View {
        NavigationStack {
            Group {
                if let loadError {
                    BrandEmptyState(
                        title: "Couldn't load agents",
                        message: loadError,
                        systemImage: "wifi.exclamationmark"
                    )
                } else if agents.isEmpty {
                    BrandEmptyState(
                        title: "Build your agent bench",
                        message: "Add agents for personal calls, reception, sales, support, and operations.",
                        systemImage: "person.wave.2"
                    )
                } else {
                    List(agents) { agent in
                        AssistantRow(agent: agent)
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Agents")
            .wirelineBrand()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Create agent")
                }
            }
            .sheet(isPresented: $showCreate) { createSheet }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private var roleChoices: [AgentRole] {
        if !agentRoles.isEmpty { return agentRoles }
        return [
            AgentRole(id: "scheduler", label: "Personal agent", archetype: "Scheduler"),
            AgentRole(id: "customer_service", label: "Support desk", archetype: "Support"),
            AgentRole(id: "receptionist", label: "Front desk", archetype: "Receptionist"),
            AgentRole(id: "custom", label: "Operations", archetype: "Custom"),
        ]
    }

    private var createSheet: some View {
        NavigationStack {
            Form {
                Section("Agent type") {
                    Picker("Posture", selection: $isBusinessAgent) {
                        Text("Personal agent").tag(false)
                        Text("Business agent").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .onChange(of: isBusinessAgent) { _, business in
                        if business, role == "scheduler" { role = "receptionist" }
                    }
                }
                Section("Start with one clear job") {
                    TextField("Name", text: $name)
                    if rolesLoading && agentRoles.isEmpty {
                        ProgressView("Loading agent roles…")
                    } else {
                        Picker("Job", selection: $role) {
                            ForEach(roleChoices, id: \.id) { choice in
                                Text(choice.label).tag(choice.id)
                            }
                        }
                    }
                }
                Section {
                    Button {
                        Task { await create() }
                    } label: {
                        if isCreating {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Label("Create agent", systemImage: "wand.and.stars")
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
            .navigationTitle(isBusinessAgent ? "New business agent" : "New personal agent")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { showCreate = false }
                }
            }
            .task { await loadRoles() }
        }
        .presentationDetents([.medium])
    }

    @MainActor private func loadRoles() async {
        rolesLoading = true
        defer { rolesLoading = false }
        do {
            agentRoles = try await WirelineAPI.shared.agentRoles()
        } catch {
            agentRoles = []
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

    @MainActor private func create() async {
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty else { return }
        isCreating = true
        creationError = nil
        defer { isCreating = false }
        do {
            let agent = try await MobileAssistantCreation.create(
                name: cleanName,
                role: role,
                isBusinessAgent: isBusinessAgent
            )
            agents.insert(agent, at: 0)
            name = ""
            showCreate = false
            await load()
        } catch {
            creationError = error.localizedDescription
        }
    }
}
