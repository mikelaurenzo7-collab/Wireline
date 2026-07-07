import SwiftUI

/// Native command center for personal and business plans: dispatch calls,
/// monitor live work, review follow-ups, and manage agents from mobile.
struct WorkspaceView: View {
    @EnvironmentObject private var auth: AuthService
    @EnvironmentObject private var router: WirelineRouter
    @State private var me: MobileMe?
    @State private var agents: [Agent] = []
    @State private var activeCalls = 0
    @State private var followUps = 0
    @State private var error: String?
    @State private var showDialer = false
    @State private var showSettings = false

    var body: some View {
        NavigationStack {
            Group {
                if let me {
                    ScrollView {
                        VStack(spacing: 16) {
                            askCard
                            if me.settings?.handoffPhone?.isEmpty ?? true {
                                callbackNumberPromptCard
                            }
                            metrics
                            account(me)
                            agentSection(me)
                            links
                        }
                        .padding(16)
                    }
                    .background(Brand.canvas)
                } else if let error {
                    BrandEmptyState(title: "Couldn't load", message: error, systemImage: "wifi.exclamationmark")
                } else {
                    ProgressView("Loading Wireline...").tint(Brand.accent)
                }
            }
            .navigationTitle(me?.account.mode == .business ? "Command" : "Wireline")
            .navigationBarTitleDisplayMode(.inline)
            .wirelineBrand()
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Button { showSettings = true } label: { Label("Settings", systemImage: "gearshape") }
                        Button("Sign out", role: .destructive) { auth.signOut() }
                    } label: { Image(systemName: "line.3.horizontal") }
                    .accessibilityLabel("Open menu")
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showDialer = true } label: { Image(systemName: "phone.arrow.up.right") }
                        .disabled(agents.isEmpty)
                        .accessibilityLabel("Place a call")
                }
            }
            .sheet(isPresented: $showDialer) { OutboundCallView(agents: agents) }
            .sheet(isPresented: $showSettings) { NavigationStack { SettingsView() } }
            .navigationDestination(isPresented: $router.showWallet) { WalletView() }
            .task { await load() }
            .refreshable { await load() }
        }
    }

    private var askCard: some View {
        Button { router.showAsk = true } label: {
            HStack(spacing: 14) {
                Image(systemName: "mic.fill")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Brand.accent)
                    .frame(width: 48, height: 48)
                    .background(Brand.accentSoft, in: Circle())
                VStack(alignment: .leading, spacing: 4) {
                    Text("Ask Wireline").font(.title3.weight(.semibold)).foregroundStyle(Brand.text)
                    Text("Dispatch calls, waits, approvals, and follow-ups.").font(.subheadline).foregroundStyle(Brand.text2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Brand.text3)
            }
            .padding(16)
            .brandGlowCard()
        }
        .buttonStyle(TouchPressStyle())
        .accessibilityHint("Opens a request for Wireline to handle")
    }

    private var callbackNumberPromptCard: some View {
        Button { showSettings = true } label: {
            HStack(spacing: 14) {
                Image(systemName: "phone.badge.plus")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(Brand.accent)
                    .frame(width: 48, height: 48)
                    .background(Brand.accentSoft, in: Circle())
                VStack(alignment: .leading, spacing: 4) {
                    Text("Set callback number").font(.subheadline.weight(.semibold)).foregroundStyle(Brand.text)
                    Text("Enable live call transfers to your device.").font(.caption).foregroundStyle(Brand.text2)
                }
                Spacer(minLength: 0)
                Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Brand.text3)
            }
            .padding(16)
            .brandGlowCard()
        }
        .buttonStyle(TouchPressStyle())
        .accessibilityHint("Opens settings to set your callback phone number")
    }

    private var metrics: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Command center").font(.mono(.caption2, weight: .semibold)).foregroundStyle(Brand.text3).textCase(.uppercase)
            HStack(spacing: 8) {
                Metric(title: "Calls now", value: "\(activeCalls)", icon: "phone.fill", active: activeCalls > 0)
                Metric(title: "Follow-ups", value: "\(followUps)", icon: "bell.badge.fill", active: followUps > 0)
                Metric(title: "Agents", value: "\(agents.count)", icon: "person.2.fill", active: false)
            }
        }
    }

    private func account(_ me: MobileMe) -> some View {
        HStack(spacing: 12) {
            Medallion(systemImage: me.account.mode == .business ? "person.2.fill" : "person.fill", size: 42)
            VStack(alignment: .leading, spacing: 3) {
                Text(me.account.businessName ?? me.user.fullName ?? me.user.email).font(.headline).foregroundStyle(Brand.text)
                Text("\(me.account.planName) - \(quotaText(me.agents))").font(.caption).foregroundStyle(Brand.text2)
            }
            Spacer()
            if me.account.subscriptionStatus != "active" {
                Text("Needs attention").font(.caption2.weight(.semibold)).foregroundStyle(Brand.destructive)
            }
        }
        .padding(16)
        .brandGlowCard()
    }

    @ViewBuilder
    private func agentSection(_ me: MobileMe) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Agents").font(.mono(.caption2, weight: .semibold)).foregroundStyle(Brand.text3).textCase(.uppercase)
                Spacer()
                Text("\(agents.count)").font(.caption.weight(.semibold)).foregroundStyle(Brand.text2)
            }
            VStack(spacing: 0) {
                if agents.isEmpty {
                    BrandEmptyState(
                        title: "Personal and business agents",
                        message: "Create a personal, front desk, sales, support, or operations agent.",
                        systemImage: "person.wave.2"
                    )
                } else {
                    ForEach(agents) { agent in
                        AssistantRow(agent: agent).padding(.horizontal, 16).padding(.vertical, 8)
                        if agent.id != agents.last?.id { Divider().padding(.leading, 68) }
                    }
                }
                if me.agents.canAddMore, let price = me.extraAgent.priceUsd, me.extraAgent.configured {
                    Divider()
                    Label("Add an agent - $\(Int(price))/mo", systemImage: "plus.circle")
                        .font(.subheadline.weight(.medium)).foregroundStyle(Brand.accent).padding(16)
                }
            }
            .brandGlowCard()
        }
    }

    private var links: some View {
        VStack(spacing: 0) {
            NavigationLink { WalletView() } label: { Label("Wallet & credits", systemImage: "creditcard").foregroundStyle(Brand.text).padding(16) }
            Divider().padding(.leading, 48)
            NavigationLink { ActivationSetupView() } label: { Label("Activate Wireline everywhere", systemImage: "wand.and.stars").foregroundStyle(Brand.text).padding(16) }
        }
        .brandGlowCard()
    }

    private func quotaText(_ quota: MobileMe.AgentQuota) -> String {
        if quota.unlimited { return "\(quota.count) agents" }
        if let cap = quota.effectiveCap { return "\(quota.count) of \(cap) agents" }
        return "\(quota.count) agents"
    }

    @MainActor private func load() async {
        do {
            async let meTask = WirelineAPI.shared.me()
            async let agentsTask = WirelineAPI.shared.agents()
            async let activeTask = WirelineAPI.shared.activeCalls()
            async let recentsTask = WirelineAPI.shared.recentCalls()
            let resolvedMe = try await meTask
            let resolvedAgents = try await agentsTask
            let resolvedActiveCalls = try await activeTask
            let resolvedRecents = try await recentsTask
            me = resolvedMe
            agents = resolvedAgents
            activeCalls = resolvedActiveCalls.count
            followUps = resolvedRecents.needsAttention
            error = nil
            auth.accountType = resolvedMe.account.mode.rawValue
        } catch {
            self.error = error.localizedDescription
        }
    }
}

private struct Metric: View {
    let title: String
    let value: String
    let icon: String
    let active: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: icon).font(.caption.weight(.semibold)).foregroundStyle(active ? .white : Brand.accent)
            Spacer(minLength: 0)
            Text(value).font(.title3.weight(.semibold)).foregroundStyle(active ? .white : Brand.text)
            Text(title).font(.caption2.weight(.medium)).foregroundStyle(active ? .white.opacity(0.78) : Brand.text3).lineLimit(1).minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
        .padding(12)
        .background(active ? Brand.accent : Brand.panel2, in: RoundedRectangle(cornerRadius: Brand.radiusSm, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Brand.radiusSm, style: .continuous).stroke(active ? Brand.accent : Brand.border, lineWidth: 1))
    }
}
