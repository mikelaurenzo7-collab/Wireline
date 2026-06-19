import CarPlay

/// CarPlay Communication template. CallKit handles native call UI; this scene adds
/// glanceable callbacks, live ops, and agent lines — minimal and driving-safe.
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
            let item = CPListItem(text: "Open Wireline on your phone to sign in", detailText: nil)
            return CPListTemplate(title: "Wireline", sections: [CPListSection(items: [item])])
        }
        let item = CPListItem(text: "Loading…", detailText: nil)
        return CPListTemplate(title: "Wireline", sections: [CPListSection(items: [item])])
    }

    @MainActor
    private func refresh() async {
        guard KeychainStore.loadToken() != nil else { return }
        async let recentsReq = WirelineAPI.shared.recentCalls(limit: 8)
        async let agentsReq = WirelineAPI.shared.agents()
        async let activeReq = WirelineAPI.shared.activeCalls()
        async let meReq = WirelineAPI.shared.me()

        let recents = (try? await recentsReq)?.calls ?? []
        let agents = (try? await agentsReq) ?? []
        let active = (try? await activeReq) ?? []
        let me = try? await meReq

        let template = rootTemplate(me: me, activeCalls: active, recents: recents, agents: agents)
        interfaceController?.setRootTemplate(template, animated: true, completion: nil)
    }

    private func rootTemplate(
        me: MobileMe?,
        activeCalls: [ActiveCall],
        recents: [RecentCall],
        agents: [Agent]
    ) -> CPListTemplate {
        var sections: [CPListSection] = []

        if let me {
            let label = me.account.businessName ?? me.user.fullName ?? me.user.email
            let mode = me.account.mode == .personal ? "Personal" : "Business"
            let accountItem = CPListItem(text: label, detailText: "\(mode) · \(me.account.planName)")
            accountItem.isEnabled = false
            sections.append(CPListSection(items: [accountItem], header: "Workspace", sectionIndexTitle: nil))
        }

        if !activeCalls.isEmpty {
            let liveItems = activeCalls.map { call -> CPListItem in
                let title = call.customerNumber ?? call.label ?? "Live call"
                let item = CPListItem(text: title, detailText: call.status?.capitalized ?? "In progress")
                item.isEnabled = false
                return item
            }
            sections.append(CPListSection(items: liveItems, header: "Live now", sectionIndexTitle: nil))
        }

        let recentItems: [CPListItem] = recents.compactMap { call in
            guard let number = call.customerNumber else { return nil }
            let item = CPListItem(text: formatPhone(number), detailText: shortSummary(call.summary))
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

        let agentItems = agents.map { agent -> CPListItem in
            CPListItem(
                text: agent.name,
                detailText: agent.role?.replacingOccurrences(of: "_", with: " ").capitalized
            )
        }
        if !agentItems.isEmpty {
            sections.append(CPListSection(items: agentItems, header: "Agent lines", sectionIndexTitle: nil))
        }

        if sections.isEmpty {
            sections = [CPListSection(items: [CPListItem(text: "No recent calls", detailText: "Ask Wireline on your phone")])]
        }

        return CPListTemplate(title: "Wireline", sections: sections)
    }

    private func callBack(number: String, agentId: String?) async {
        guard let agentId else { return }
        _ = try? await WirelineAPI.shared.placeCall(agentId: agentId, to: number, context: nil)
    }

    private func formatPhone(_ raw: String) -> String {
        let digits = raw.filter(\.isNumber)
        guard digits.count == 11, digits.hasPrefix("1") else { return raw }
        let area = digits.dropFirst().prefix(3)
        let mid = digits.dropFirst(4).prefix(3)
        let last = digits.suffix(4)
        return "(\(area)) \(mid)-\(last)"
    }

    private func shortSummary(_ summary: String?) -> String? {
        guard let summary, !summary.isEmpty else { return nil }
        if summary.count <= 48 { return summary }
        return String(summary.prefix(45)) + "…"
    }
}
