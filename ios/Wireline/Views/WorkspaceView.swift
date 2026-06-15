import SwiftUI

/// Root workspace. `/api/mobile/me` decides the lens: Personal (a simple
/// agent picker + "add agent") or Business (the fleet roster + live calls).
struct WorkspaceView: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var router: WirelineRouter
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
                        heroSection
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
            .navigationTitle("Wireline")
            .wirelineBrand()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingDialer = true } label: {
                        Image(systemName: "phone.arrow.up.right")
                    }
                    .disabled(agents.isEmpty)
                }
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button { showingSettings = true } label: {
                            Label("Settings", systemImage: "gearshape")
                        }
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

    // MARK: - Sections

    /// Gradient "Ask Wireline" hero card — the primary on-screen entry point.
    /// Mirrors the Siri phrase, Action button, and widget tap-through.
    private var heroSection: some View {
        Section {
            Button { router.showAsk = true } label: {
                HStack(spacing: 16) {
                    ZStack {
                        Circle()
                            .fill(.white.opacity(0.18))
                            .frame(width: 52, height: 52)
                        Image(systemName: "mic.fill")
                            .font(.system(size: 22, weight: .semibold))
                            .foregroundStyle(.white)
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Ask Wireline")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(.white)
                        Text("Place calls, get recaps, and more")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.65))
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white.opacity(0.45))
                }
                .padding(20)
                .background(
                    LinearGradient(
                        colors: [Brand.purple, Brand.purpleDeep],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    ),
                    in: RoundedRectangle(cornerRadius: 16)
                )
                .shadow(color: Brand.purple.opacity(0.3), radius: 14, y: 5)
            }
            .buttonStyle(.plain)
            .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
        }
    }

    private var activationSection: some View {
        Section {
            NavigationLink { WalletView() } label: {
                Label("Wallet & credits", systemImage: "creditcard")
            }
            NavigationLink { ActivationSetupView() } label: {
                Label("Activate Wireline everywhere", systemImage: "wand.and.stars")
            }
        }
    }

    @ViewBuilder
    private func accountSection(_ me: MobileMe) -> some View {
        Section {
            HStack(spacing: 14) {
                Medallion(
                    systemImage: me.account.mode == .business ? "person.3.fill" : "person.fill",
                    size: 44
                )
                VStack(alignment: .leading, spacing: 3) {
                    Text(me.account.businessName ?? me.user.fullName ?? me.user.email)
                        .font(.headline)
                    HStack(spacing: 6) {
                        Text(me.account.planName)
                            .font(.caption).foregroundStyle(.secondary)
                        Text("·").foregroundStyle(.tertiary).font(.caption)
                        Text(agentCountLabel(me.agents))
                            .font(.caption).foregroundStyle(.secondary)
                        if me.account.subscriptionStatus != "active" {
                            Text("⚠ Inactive")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(Brand.destructive)
                        }
                    }
                }
            }
            .padding(.vertical, 2)
        }
    }

    @ViewBuilder
    private func agentSection(_ me: MobileMe) -> some View {
        Section {
            if agents.isEmpty {
                BrandEmptyState(
                    title: "No agents yet",
                    message: "Create your first agent on the web to start taking calls.",
                    systemImage: "person.wave.2"
                )
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            } else {
                ForEach(agents) { AgentRow(agent: $0) }
            }
            if me.agents.canAddMore, let price = me.extraAgent.priceUsd,
               me.extraAgent.configured {
                Label("Add an agent · $\(Int(price))/mo", systemImage: "plus.circle")
                    .foregroundStyle(Brand.purple)
            }
        } header: {
            Text("Agents")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .textCase(nil)
        }
    }

    private func agentCountLabel(_ q: MobileMe.AgentQuota) -> String {
        if q.unlimited { return "\(q.count) agents" }
        if let cap = q.effectiveCap { return "\(q.count) of \(cap) agents" }
        return "\(q.count) agents"
    }

    private func load() async {
        do {
            async let meReq = WirelineAPI.shared.me()
            async let agentsReq = WirelineAPI.shared.agents()
            self.me = try await meReq
            self.agents = try await agentsReq
            self.loadError = nil
        } catch {
            self.loadError = error.localizedDescription
        }
    }
}
