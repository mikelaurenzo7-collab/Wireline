import SwiftUI

/// Root workspace. `/api/mobile/me` decides the lens: Personal (a simple
/// agent picker + "add agent") or Business (the fleet roster + live calls).
struct WorkspaceView: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var router: WingmanRouter
    @State private var me: MobileMe?
    @State private var agents: [Agent] = []
    @State private var loadError: String?
    @State private var showingDialer = false

    var body: some View {
        NavigationStack {
            Group {
                if let me {
                    List {
                        askSection
                        accountSection(me)
                        agentSection(me)
                        if me.account.mode == .business {
                            businessSection
                        }
                        activationSection
                    }
                } else if let loadError {
                    BrandEmptyState(title: "Couldn't load", message: loadError,
                                    systemImage: "wifi.exclamationmark")
                } else {
                    ProgressView("Loading workspace…")
                }
            }
            .navigationTitle("Wingman")
            .wingmanBrand()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingDialer = true } label: { Image(systemName: "phone.arrow.up.right") }
                        .disabled(agents.isEmpty)
                }
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button("Sign out", role: .destructive) { auth.signOut() }
                    } label: { Image(systemName: "person.crop.circle") }
                }
            }
            .sheet(isPresented: $showingDialer) { OutboundCallView(agents: agents) }
            .sheet(isPresented: $router.showAsk) { AskWingmanView(agents: agents) }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    /// The big "Ask Wingman" call-to-action — the on-screen twin of the Siri
    /// phrase / Action button / Back Tap entry points.
    private var askSection: some View {
        Section {
            Button { router.showAsk = true } label: {
                Label("Ask Wingman", systemImage: "mic.fill")
            }
            .buttonStyle(PrimaryButtonStyle())
            .listRowInsets(EdgeInsets())
            .listRowBackground(Color.clear)
        }
    }

    private var activationSection: some View {
        Section {
            NavigationLink { ActivationSetupView() } label: {
                Label("Activate Wingman everywhere", systemImage: "wand.and.stars")
            }
        }
    }

    @ViewBuilder
    private func accountSection(_ me: MobileMe) -> some View {
        Section {
            HStack(spacing: 12) {
                Medallion(systemImage: me.account.mode == .business ? "person.3.fill" : "person.fill")
                VStack(alignment: .leading, spacing: 2) {
                    Text(me.account.businessName ?? me.user.fullName ?? me.user.email)
                        .font(.headline)
                    Text("\(me.account.planName) · \(agentCountLabel(me.agents))")
                        .font(.caption).foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private func agentSection(_ me: MobileMe) -> some View {
        Section("Agents") {
            if agents.isEmpty {
                BrandEmptyState(title: "No agents yet",
                                message: "Create your first agent on the web to start taking calls.",
                                systemImage: "person.wave.2")
            } else {
                ForEach(agents) { AgentRow(agent: $0) }
            }
            if me.agents.canAddMore, let price = me.extraAgent.priceUsd, me.extraAgent.configured {
                Label("Add an agent · $\(Int(price))/mo", systemImage: "plus.circle")
                    .foregroundStyle(Brand.purple)
            }
        }
    }

    private var businessSection: some View {
        Section("Command") {
            NavigationLink { ActiveCallsView() } label: {
                Label("Live calls", systemImage: "dot.radiowaves.left.and.right")
            }
        }
    }

    private func agentCountLabel(_ q: MobileMe.AgentQuota) -> String {
        if q.unlimited { return "\(q.count) agents" }
        if let cap = q.effectiveCap { return "\(q.count) of \(cap) agents" }
        return "\(q.count) agents"
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
        Group {
            if calls.isEmpty {
                BrandEmptyState(title: "No live calls", message: "Active calls will appear here.",
                                systemImage: "phone.down")
            } else {
                List(calls) { CallCard(call: $0) }
            }
        }
        .navigationTitle("Live calls")
        .wingmanBrand()
        .task { await refresh() }
        .refreshable { await refresh() }
    }

    private func refresh() async {
        calls = (try? await WingmanAPI.shared.activeCalls()) ?? []
    }
}
