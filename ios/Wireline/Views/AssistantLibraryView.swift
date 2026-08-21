import SwiftUI

struct AssistantLibraryView: View {
    @State private var agents: [Agent] = []
    @State private var agentRoles: [AgentRole] = []
    @State private var rolesLoading = false
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
                        title: "COULDN'T LOAD BOTS",
                        message: loadError,
                        systemImage: "wifi.exclamationmark"
                    )
                } else if agents.isEmpty {
                    BrandEmptyState(
                        title: "NO BOTS YET",
                        message: "Start with a role or create your own. Every Bot lives in the same workspace.",
                        systemImage: "waveform.and.person.filled"
                    )
                } else {
                    List(agents) { agent in
                        AssistantRow(agent: agent)
                    }
                    .listStyle(.insetGrouped)
                    .scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("BOTS")
            .wirelineBrand()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showCreate = true } label: { Image(systemName: "plus") }
                        .accessibilityLabel("Create Bot")
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
            AgentRole(id: "scheduler", label: "Appointment Setter", archetype: "Scheduler"),
            AgentRole(id: "customer_service", label: "Support Desk", archetype: "Support"),
            AgentRole(id: "receptionist", label: "Front Desk", archetype: "Receptionist"),
            AgentRole(id: "custom", label: "Create Your Own", archetype: "Custom"),
        ]
    }

    private var createSheet: some View {
        NavigationStack {
            Form {
                Section("START WITH ONE CLEAR JOB") {
                    TextField("BOT NAME", text: $name)
                    if rolesLoading && agentRoles.isEmpty {
                        ProgressView("Loading roles…")
                    } else {
                        Picker("ROLE", selection: $role) {
                            ForEach(roleChoices, id: \.id) { choice in
                                Text(customerRoleLabel(choice).uppercased()).tag(choice.id)
                            }
                        }
                    }
                    Text("Voice, live conversation, text, email, knowledge, tools, and outcomes stay in the same workspace.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }
                Section {
                    Button {
                        Task { await create() }
                    } label: {
                        if isCreating {
                            ProgressView().frame(maxWidth: .infinity)
                        } else {
                            Label("CREATE BOT", systemImage: "wand.and.stars")
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
            .navigationTitle("NEW BOT")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("CANCEL") { showCreate = false }
                }
            }
            .task { await loadRoles() }
        }
        .presentationDetents([.medium, .large])
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
                // The server still stores this compatibility profile. Derive it
                // from the selected job instead of asking customers to choose an
                // audience lane.
                isBusinessAgent: role != "personal_assistant"
            )
            agents.insert(agent, at: 0)
            name = ""
            showCreate = false
            await load()
        } catch {
            creationError = error.localizedDescription
        }
    }

    private func customerRoleLabel(_ choice: AgentRole) -> String {
        choice.id == "personal_assistant" ? "Assistant" : choice.label
    }
}
