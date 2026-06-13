import SwiftUI

/// Root workspace. `/api/mobile/me` decides the lens: Personal (a simple
/// agent picker + "add agent") or Business (the fleet roster + live calls).
struct WorkspaceView: View {
    @State private var me: MobileMe?
    @State private var agents: [Agent] = []
    @State private var loadError: String?

    var body: some View {
        NavigationStack {
            Group {
                if let me {
                    List {
                        accountSection(me)
                        agentSection(me)
                        if me.account.mode == .business {
                            businessSection
                        }
                    }
                } else if let loadError {
                    ContentUnavailableView("Couldn't load", systemImage: "wifi.exclamationmark",
                                           description: Text(loadError))
                } else {
                    ProgressView("Loading workspace…")
                }
            }
            .navigationTitle("Wingman")
            .wingmanBrand()
            .task { await load() }
            .refreshable { await load() }
        }
    }

    @ViewBuilder
    private func accountSection(_ me: MobileMe) -> some View {
        Section("Account") {
            LabeledContent("Plan", value: me.account.planName)
            LabeledContent("Mode", value: me.account.mode.rawValue.capitalized)
            LabeledContent("Agents", value: agentCountLabel(me.agents))
        }
    }

    @ViewBuilder
    private func agentSection(_ me: MobileMe) -> some View {
        Section("Agents") {
            ForEach(agents) { agent in
                VStack(alignment: .leading, spacing: 2) {
                    Text(agent.name).font(.headline)
                    if let role = agent.role {
                        Text(role).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            if me.agents.canAddMore, let price = me.extraAgent.priceUsd, me.extraAgent.configured {
                Label("Add an agent · $\(Int(price))/mo", systemImage: "plus.circle")
                    .foregroundStyle(.tint)
            }
        }
    }

    private var businessSection: some View {
        Section("Command") {
            NavigationLink("Live calls") { ActiveCallsView() }
        }
    }

    private func agentCountLabel(_ q: MobileMe.AgentQuota) -> String {
        if q.unlimited { return "\(q.count) (unlimited)" }
        if let cap = q.effectiveCap { return "\(q.count) of \(cap)" }
        return "\(q.count)"
    }

    private func load() async {
        do {
            async let meCall = WingmanAPI.shared.me()
            async let agentsCall = WingmanAPI.shared.agents()
            self.me = try await meCall
            self.agents = try await agentsCall
            self.loadError = nil
        } catch {
            self.loadError = error.localizedDescription
        }
    }
}

/// Business-mode live-call list, backed by the push-missed poll fallback.
struct ActiveCallsView: View {
    @State private var calls: [ActiveCall] = []

    var body: some View {
        List(calls) { call in
            VStack(alignment: .leading) {
                Text(call.customerNumber ?? "Unknown").font(.headline)
                Text(call.status ?? "—").font(.caption).foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Live calls")
        .task { calls = (try? await WingmanAPI.shared.activeCalls()) ?? [] }
        .refreshable { calls = (try? await WingmanAPI.shared.activeCalls()) ?? [] }
    }
}
