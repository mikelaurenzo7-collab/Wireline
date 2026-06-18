import SwiftUI

/// Root workspace. `/api/mobile/me` decides the lens: Personal (a simple
/// agent picker + "add agent") or Business (the fleet roster + live calls).
struct WorkspaceView: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var router: WirelineRouter
    @State private var me: MobileMe?
    @State private var agents: [Agent] = []
    @State private var activeCallsCount = 0
    @State private var needsAttentionCount = 0
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
            if let me, me.account.mode == .business {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Fleet Operations")
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(Brand.purple)
                    
                    HStack(spacing: 12) {
                        // Card 1: Active Calls
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Image(systemName: "phone.fill")
                                    .font(.subheadline)
                                    .foregroundStyle(.white)
                                Spacer()
                                if activeCallsCount > 0 {
                                    Circle()
                                        .fill(.green)
                                        .frame(width: 8, height: 8)
                                }
                            }
                            Spacer()
                            Text("\(activeCallsCount)")
                                .font(.title.weight(.bold))
                                .foregroundStyle(.white)
                            Text("Active Calls")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.white.opacity(0.7))
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, minHeight: 90, alignment: .leading)
                        .background(Brand.purple)
                        .cornerRadius(10)
                        
                        // Card 2: Needs Attention
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Image(systemName: "bell.badge.fill")
                                    .font(.subheadline)
                                    .foregroundStyle(needsAttentionCount > 0 ? Brand.purple : .secondary)
                                Spacer()
                            }
                            Spacer()
                            Text("\(needsAttentionCount)")
                                .font(.title.weight(.bold))
                                .foregroundStyle(needsAttentionCount > 0 ? Brand.purple : .primary)
                            Text("Need Attention")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, minHeight: 90, alignment: .leading)
                        .background(Color(.secondarySystemGroupedBackground))
                        .cornerRadius(10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color(.separator), lineWidth: 0.5)
                        )
                        
                        // Card 3: Roster count
                        VStack(alignment: .leading, spacing: 4) {
                            HStack {
                                Image(systemName: "person.3.fill")
                                    .font(.subheadline)
                                    .foregroundStyle(.secondary)
                                Spacer()
                            }
                            Spacer()
                            Text("\(agents.count)")
                                .font(.title.weight(.bold))
                            Text("Agents Roster")
                                .font(.caption.weight(.medium))
                                .foregroundStyle(.secondary)
                        }
                        .padding(12)
                        .frame(maxWidth: .infinity, minHeight: 90, alignment: .leading)
                        .background(Color(.secondarySystemGroupedBackground))
                        .cornerRadius(10)
                        .overlay(
                            RoundedRectangle(cornerRadius: 10)
                                .stroke(Color(.separator), lineWidth: 0.5)
                        )
                    }
                }
                .padding(.vertical, 8)
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            } else {
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
                        Brand.purple, // Sharp solid brand purple (matches web editorial CTAs)
                        in: RoundedRectangle(cornerRadius: 12)
                    )
                    .shadow(color: Brand.purple.opacity(0.3), radius: 14, y: 5)
                }
                .buttonStyle(.plain)
                .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                .listRowBackground(Color.clear)
                .listRowSeparator(.hidden)
            }
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

    @MainActor
    private func load() async {
        do {
            async let meReq = WirelineAPI.shared.me()
            async let agentsReq = WirelineAPI.shared.agents()
            async let activeReq = WirelineAPI.shared.activeCalls()
            async let recentReq = WirelineAPI.shared.recentCalls()
            let resolvedMe = try await meReq
            self.me = resolvedMe
            self.agents = try await agentsReq
            self.activeCallsCount = (try? await activeReq.count) ?? 0
            self.needsAttentionCount = (try? await recentReq.needsAttention) ?? 0
            self.loadError = nil
            auth.accountType = resolvedMe.account.mode.rawValue
        } catch {
            self.loadError = error.localizedDescription
        }
    }
}
