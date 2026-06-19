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
                        statusSection
                        accountSection(me)
                        agentSection(me)
                        activationSection
                    }
                    .listStyle(.insetGrouped)
                } else if let loadError {
                    BrandEmptyState(title: "Couldn't load", message: loadError,
                                    systemImage: "wifi.exclamationmark")
                } else {
                    ProgressView("Loading workspace…")
                        .tint(Brand.violetSoft)
                }
            }
            .navigationTitle("WIRELINE")
            .wirelineBrand()
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showingDialer = true } label: {
                        Image(systemName: "phone.arrow.up.right")
                    }
                    .disabled(agents.isEmpty)
                    .accessibilityLabel("Place outbound call")
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

    /// Primary consumer launch surface: one obvious action, then proof that the
    /// assistant is live and watching the line.
    private var heroSection: some View {
        Section {
            Button { router.showAsk = true } label: {
                VStack(alignment: .leading, spacing: 18) {
                    HStack(spacing: 14) {
                        ZStack {
                            Circle()
                                .fill(.white.opacity(0.16))
                                .frame(width: 56, height: 56)
                            Image(systemName: "mic.fill")
                                .font(.system(size: 22, weight: .semibold))
                                .foregroundStyle(.white)
                        }
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Ask Wireline")
                                .font(.title2.weight(.bold))
                                .foregroundStyle(.white)
                            Text("Have your AI call, wait, summarize, and follow up.")
                                .font(.subheadline)
                                .foregroundStyle(.white.opacity(0.74))
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 8)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.white.opacity(0.52))
                    }

                    HStack(spacing: 8) {
                        LaunchPill(icon: "phone.fill", text: "Calls")
                        LaunchPill(icon: "text.bubble.fill", text: "Recaps")
                        LaunchPill(icon: "bell.badge.fill", text: "Alerts")
                    }
                }
                .padding(20)
                .background(
                    ZStack {
                        LinearGradient(
                            colors: [Brand.violet, Brand.violetDeep],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                        Circle()
                            .fill(Brand.violetSoft.opacity(0.28))
                            .frame(width: 180, height: 180)
                            .blur(radius: 34)
                            .offset(x: 122, y: -60)
                        Circle()
                            .fill(Color.white.opacity(0.10))
                            .frame(width: 130, height: 130)
                            .blur(radius: 38)
                            .offset(x: -96, y: 70)
                    },
                    in: RoundedRectangle(cornerRadius: 24, style: .continuous)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 24, style: .continuous)
                        .stroke(.white.opacity(0.16), lineWidth: 1)
                )
                .shadow(color: Brand.violet.opacity(0.34), radius: 24, y: 12)
            }
            .buttonStyle(.plain)
            .listRowInsets(EdgeInsets(top: 14, leading: 16, bottom: 8, trailing: 16))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
        }
    }

    private var statusSection: some View {
        Section {
            HStack(spacing: 10) {
                ConsoleMetricCard(
                    title: "Live",
                    value: "\(activeCallsCount)",
                    icon: "phone.fill",
                    highlighted: activeCallsCount > 0
                )
                ConsoleMetricCard(
                    title: "Needs attention",
                    value: "\(needsAttentionCount)",
                    icon: "bell.badge.fill",
                    highlighted: needsAttentionCount > 0
                )
                ConsoleMetricCard(
                    title: "Agents",
                    value: "\(agents.count)",
                    icon: "person.3.fill",
                    highlighted: false
                )
            }
            .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 12, trailing: 16))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
        } header: {
            Text("Console")
                .font(.mono(.caption2, weight: .semibold))
                .foregroundStyle(Brand.text3)
                .textCase(.uppercase)
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
                        .foregroundStyle(Brand.text)
                    HStack(spacing: 6) {
                        Text(me.account.planName)
                            .font(.caption).foregroundStyle(Brand.text2)
                        Text("·").foregroundStyle(Brand.text3).font(.caption)
                        Text(agentCountLabel(me.agents))
                            .font(.caption).foregroundStyle(Brand.text2)
                        if me.account.subscriptionStatus != "active" {
                            Text("Inactive")
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
                    .foregroundStyle(Brand.violetSoft)
            }
        } header: {
            Text("Agents")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Brand.text3)
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

private struct LaunchPill: View {
    let icon: String
    let text: String

    var body: some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.white.opacity(0.88))
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(.white.opacity(0.12), in: Capsule())
    }
}

private struct ConsoleMetricCard: View {
    let title: String
    let value: String
    let icon: String
    let highlighted: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Image(systemName: icon)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(highlighted ? .white : Brand.violetSoft)
                Spacer(minLength: 0)
            }
            Text(value)
                .font(.title2.weight(.bold))
                .foregroundStyle(highlighted ? .white : Brand.text)
            Text(title)
                .font(.mono(.caption2, weight: .semibold))
                .foregroundStyle(highlighted ? .white.opacity(0.72) : Brand.text3)
                .lineLimit(1)
                .minimumScaleFactor(0.78)
        }
        .frame(maxWidth: .infinity, minHeight: 98, alignment: .leading)
        .padding(12)
        .background(
            highlighted
                ? AnyShapeStyle(LinearGradient(colors: [Brand.violet, Brand.violetDeep], startPoint: .topLeading, endPoint: .bottomTrailing))
                : AnyShapeStyle(LinearGradient(colors: [Brand.panel2.opacity(0.92), Brand.panel.opacity(0.88)], startPoint: .topLeading, endPoint: .bottomTrailing)),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(.white.opacity(highlighted ? 0.16 : 0.10), lineWidth: 1)
        )
    }
}
