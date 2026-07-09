import SwiftUI

struct KnowledgeView: View {
    @State private var agents: [Agent] = []
    @State private var selectedId = ""
    @State private var setup: MobileAgentSetup?
    @State private var draft = ""
    @State private var entryType = "knowledge"
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if agents.isEmpty && !isLoading {
                    BrandEmptyState(title: "Start with an AI phone employee", message: "Create the employee first, then add the facts, rules, and sources that make it useful.", systemImage: "book.closed")
                } else {
                    List {
                        if agents.count > 1 {
                            Section { Picker("Employee", selection: $selectedId) { ForEach(agents) { agent in Text(agent.name).tag(agent.id) } } }
                        }
                        Section("Training details") {
                            if let setup, setup.knowledge.isEmpty { Text("No saved details yet.").foregroundStyle(Brand.text2) }
                            else { ForEach(setup?.knowledge ?? []) { entry in Text(entry.content) } }
                        }
                        Section("Behavior") {
                            if let setup, setup.directives.isEmpty { Text("No saved rules yet.").foregroundStyle(Brand.text2) }
                            else { ForEach(setup?.directives ?? []) { entry in Text(entry.content) } }
                        }
                        Section("Add a detail") {
                            Picker("Save as", selection: $entryType) { Text("Detail").tag("knowledge"); Text("Rule").tag("directive") }.pickerStyle(.segmented)
                            TextField(entryType == "knowledge" ? "A preference, fact, routine, or policy" : "What the employee should do or avoid", text: $draft, axis: .vertical).lineLimit(3...6)
                            Button { Task { await save() } } label: { if isSaving { ProgressView().frame(maxWidth: .infinity) } else { Label(entryType == "knowledge" ? "Save detail" : "Save rule", systemImage: "plus").frame(maxWidth: .infinity) } }
                                .buttonStyle(.borderedProminent).tint(Brand.accent).disabled(draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSaving || selectedId.isEmpty)
                        }
                        if let error { Section { Text(error).foregroundStyle(Brand.destructive) } }
                    }.scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Train")
            .wirelineBrand()
            .task { await loadAgents() }
            .onChange(of: selectedId) { _, _ in Task { await loadSetup() } }
            .refreshable { await loadSetup() }
        }
    }

    @MainActor private func loadAgents() async {
        isLoading = true; defer { isLoading = false }
        do { agents = try await WirelineAPI.shared.agents(); if selectedId.isEmpty { selectedId = agents.first?.id ?? "" }; await loadSetup() }
        catch { self.error = error.localizedDescription }
    }

    @MainActor private func loadSetup() async {
        guard !selectedId.isEmpty else { setup = nil; return }
        do { setup = try await MobileSetupAPI.load(agentId: selectedId); error = nil }
        catch { self.error = error.localizedDescription }
    }

    @MainActor private func save() async {
        let value = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !value.isEmpty, !selectedId.isEmpty else { return }
        isSaving = true; defer { isSaving = false }
        do { try await MobileSetupAPI.save(agentId: selectedId, type: entryType, content: value); draft = ""; await loadSetup() }
        catch { self.error = error.localizedDescription }
    }
}

struct ActionsView: View {
    private struct Action: Identifiable { let id: String; let title: String; let detail: String }
    private let personalActions = [
        Action(id: "view_recent_interactions", title: "Use recent context", detail: "Keeps a call or follow-up connected to what already happened."),
        Action(id: "escalate_to_human", title: "Ask me first", detail: "Brings anything sensitive, unclear, or high-stakes back to you."),
        Action(id: "create_followup_task", title: "Create a follow-up", detail: "Saves a reminder when something needs your attention."),
        Action(id: "send_email", title: "Send an email", detail: "Sends confirmations and approved follow-ups."),
        Action(id: "send_text_message", title: "Send a text", detail: "Sends a text update when messaging is appropriate."),
        Action(id: "check_calendar_availability", title: "Check your calendar", detail: "Looks for a time before proposing it."),
        Action(id: "book_appointment", title: "Book an appointment", detail: "Creates an event when you have approved the slot."),
        Action(id: "navigate_to", title: "Open directions", detail: "Sends navigation to your phone when a call gives you an address."),
        Action(id: "add_reminder", title: "Add a reminder", detail: "Creates a reminder for something you need to handle."),
    ]
    @State private var agents: [Agent] = []
    @State private var selectedId = ""
    @State private var enabled = Set<String>()
    @State private var isLoading = false
    @State private var isSaving = false
    @State private var error: String?

    var body: some View {
        NavigationStack {
            Group {
                if agents.isEmpty && !isLoading {
                    BrandEmptyState(title: "Start with an AI phone employee", message: "Create the employee first, then choose what it is allowed to do.", systemImage: "slider.horizontal.3")
                } else {
                    List {
                        if agents.count > 1 { Section { Picker("Employee", selection: $selectedId) { ForEach(agents) { agent in Text(agent.name).tag(agent.id) } } } }
                        Section("Ways your employee can help") {
                            ForEach(personalActions) { action in
                                Toggle(isOn: binding(for: action.id)) { VStack(alignment: .leading, spacing: 3) { Text(action.title).foregroundStyle(Brand.text); Text(action.detail).font(.caption).foregroundStyle(Brand.text2) } }
                                    .tint(Brand.accent).disabled(isSaving || selectedId.isEmpty)
                            }
                        }
                        Section { Text("Use mobile for fast approvals and core call workflows. Configure deeper CRM, calendar, and billing connections on the web console.").font(.caption).foregroundStyle(Brand.text2) }
                        if let error { Section { Text(error).foregroundStyle(Brand.destructive) } }
                    }.scrollContentBackground(.hidden)
                }
            }
            .navigationTitle("Launch")
            .wirelineBrand()
            .task { await loadAgents() }
            .onChange(of: selectedId) { _, _ in Task { await loadSetup() } }
            .refreshable { await loadSetup() }
        }
    }

    private func binding(for action: String) -> Binding<Bool> { Binding(get: { enabled.contains(action) }, set: { next in var updated = enabled; if next { updated.insert(action) } else { updated.remove(action) }; enabled = updated; Task { await persist(updated) } }) }

    @MainActor private func loadAgents() async {
        isLoading = true; defer { isLoading = false }
        do { agents = try await WirelineAPI.shared.agents(); if selectedId.isEmpty { selectedId = agents.first?.id ?? "" }; await loadSetup() }
        catch { self.error = error.localizedDescription }
    }

    @MainActor private func loadSetup() async {
        guard !selectedId.isEmpty else { enabled = []; return }
        do { let setup = try await MobileSetupAPI.load(agentId: selectedId); enabled = Set(setup.enabledTools); error = nil }
        catch { self.error = error.localizedDescription }
    }

    @MainActor private func persist(_ updated: Set<String>) async {
        guard !selectedId.isEmpty else { return }
        isSaving = true; defer { isSaving = false }
        do { try await MobileSetupAPI.updateActions(agentId: selectedId, enabled: updated.sorted()); error = nil }
        catch { self.error = error.localizedDescription; await loadSetup() }
    }
}
