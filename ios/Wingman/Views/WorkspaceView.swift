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
    @State private var showingSettings = false

    var body: some View {
        NavigationStack {
            Group {
                if let me {
                    List {
                        askSection
                        accountSection(me)
                        agentSection(me)
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
                        Button { showingSettings = true } label: { Label("Settings", systemImage: "gearshape") }
                        Button("Sign out", role: .destructive) { auth.signOut() }
                    } label: { Image(systemName: "person.crop.circle") }
                }
            }
            .sheet(isPresented: $showingDialer) { OutboundCallView(agents: agents) }
            .sheet(isPresented: $showingSettings) { NavigationStack { SettingsView() } }
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
