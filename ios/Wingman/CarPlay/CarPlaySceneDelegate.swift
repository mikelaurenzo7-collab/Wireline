import CarPlay

/// CarPlay Communication template. Most of the in-car value is free: because
/// Wingman uses CallKit + PushKit, inbound/outbound calls already render in
/// CarPlay's native call UI. This scene adds the glanceable list surface — call
/// recent numbers back, see live call handoff opportunities, and see your
/// personal/business agents — kept deliberately minimal so it's safe to use
/// while driving and fits Apple's Communication category.
///
/// Activates only once Apple grants `com.apple.developer.carplay-communication`
/// (see ios/SETUP_CHECKLIST.md). Until then this scene simply never connects.
final class CarPlaySceneDelegate: UIResponder, CPTemplateApplicationSceneDelegate {
    private var interfaceController: CPInterfaceController?

    func templateApplicationScene(
        _ scene: CPTemplateApplicationScene,
        didConnect interfaceController: CPInterfaceController
    ) {
        self.interfaceController = interfaceController
        interfaceController.setRootTemplate(loadingTemplate(), animated: false, completion: nil)
        Task { await refresh() }
    }

    func templateApplicationScene(
        _ scene: CPTemplateApplicationScene,
        didDisconnectInterfaceController interfaceController: CPInterfaceController
    ) {
        self.interfaceController = nil
    }

    // MARK: - Templates

    private func loadingTemplate() -> CPListTemplate {
        if KeychainStore.loadToken() == nil {
            let item = CPListItem(text: "Open Wingman on your phone to sign in", detailText: nil)
            return CPListTemplate(title: "Wingman", sections: [CPListSection(items: [item])])
        }
        let item = CPListItem(text: "Loading…", detailText: nil)
        return CPListTemplate(title: "Wingman", sections: [CPListSection(items: [item])])
    }

    @MainActor
    private func refresh() async {
        guard KeychainStore.loadToken() != nil else { return }
        async let meResult = try? WingmanAPI.shared.me()
        async let activeResult = try? WingmanAPI.shared.activeCalls()
        async let recentsResult = try? WingmanAPI.shared.recentCalls(limit: 8)
        async let agentsResult = try? WingmanAPI.shared.agents()

        let me = await meResult
        let activeCalls = await activeResult ?? []
        let recents = await recentsResult?.calls ?? []
        let agents = await agentsResult ?? []
        let template = rootTemplate(me: me, activeCalls: activeCalls, recents: recents, agents: agents)
        interfaceController?.setRootTemplate(template, animated: true, completion: nil)
    }

    private func rootTemplate(
        me: MobileMe?,
        activeCalls: [ActiveCall],
        recents: [RecentCall],
        agents: [Agent]
    ) -> CPListTemplate {
        var sections: [CPListSection] = []

        // Business live ops, but restricted to communication-safe active-call
        // status and handoff. No analytics dashboards or admin controls in car.
        let activeItems: [CPListItem] = activeCalls.map { call in
            let title = call.label ?? call.customerNumber ?? "Live call"
            let detail = [call.status, agentName(for: call.agentId, agents: agents)]
                .compactMap { $0 }
                .joined(separator: " • ")
            let item = CPListItem(text: title, detailText: detail.isEmpty ? "Tap to take this call" : detail)
            item.handler = { [weak self] _, completion in
                Task {
                    await self?.handoff(callId: call.callId)
                    completion()
                }
            }
            return item
        }
        if !activeItems.isEmpty {
            sections.append(CPListSection(items: activeItems, header: "Live ops", sectionIndexTitle: nil))
        }

        if let me, me.account.mode == .business {
            let name = me.account.businessName ?? me.account.planName
            let quota = me.agents.unlimited
                ? "\(me.agents.count) agents • unlimited plan"
                : "\(me.agents.count)/\(me.agents.effectiveCap ?? me.agents.included ?? me.agents.count) agents"
            sections.append(CPListSection(
                items: [CPListItem(text: name, detailText: quota)],
                header: "Business",
                sectionIndexTitle: nil
            ))
        }

        // Call a recent number back — the primary in-car communication action.
        let recentItems: [CPListItem] = recents.compactMap { call in
            guard let number = call.customerNumber else { return nil }
            let item = CPListItem(text: number, detailText: call.summary)
            item.handler = { [weak self] _, completion in
                Task {
                    await self?.callBack(number: number, agentId: agents.first?.id)
                    completion()
                }
            }
            return item
        }
        if !recentItems.isEmpty {
            sections.append(CPListSection(items: recentItems, header: "Call back", sectionIndexTitle: nil))
        }

        // Agents (informational — who's answering on your lines).
        let agentItems = agents.map { agent -> CPListItem in
            CPListItem(text: agent.name, detailText: agent.role?.replacingOccurrences(of: "_", with: " "))
        }
        if !agentItems.isEmpty {
            sections.append(CPListSection(items: agentItems, header: "Agents", sectionIndexTitle: nil))
        }

        if sections.isEmpty {
            sections = [CPListSection(items: [CPListItem(text: "No recent calls", detailText: nil)])]
        }
        return CPListTemplate(title: "Wingman", sections: sections)
    }

    private func agentName(for agentId: String?, agents: [Agent]) -> String? {
        guard let agentId else { return nil }
        return agents.first(where: { $0.id == agentId })?.name
    }

    private func handoff(callId: String) async {
        _ = try? await WingmanAPI.shared.handoffCall(callId: callId)
    }

    private func callBack(number: String, agentId: String?) async {
        guard let agentId else { return }
        _ = try? await WingmanAPI.shared.placeCall(agentId: agentId, to: number, context: nil)
    }
}
