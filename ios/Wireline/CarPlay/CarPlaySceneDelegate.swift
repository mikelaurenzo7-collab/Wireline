import CarPlay

/// CarPlay Communication template. Most of the in-car value is free: because
/// Wireline uses CallKit + PushKit, inbound/outbound calls already render in
/// CarPlay's native call UI. This scene adds the glanceable list surface — call
/// recent numbers back, see your agents — kept deliberately minimal so it's safe
/// to use while driving and fits Apple's Communication category.
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
            let item = CPListItem(text: "Open Wireline on your phone to sign in", detailText: nil)
            return CPListTemplate(title: "Wireline", sections: [CPListSection(items: [item])])
        }
        let item = CPListItem(text: "Loading…", detailText: nil)
        return CPListTemplate(title: "Wireline", sections: [CPListSection(items: [item])])
    }

    @MainActor
    private func refresh() async {
        guard KeychainStore.loadToken() != nil else { return }
        let recents = (try? await WirelineAPI.shared.recentCalls(limit: 8))?.calls ?? []
        let agents = (try? await WirelineAPI.shared.agents()) ?? []
        let active = (try? await WirelineAPI.shared.activeCalls()) ?? []
        let template = rootTemplate(active: active, recents: recents, agents: agents)
        interfaceController?.setRootTemplate(template, animated: true, completion: nil)
    }

    private func rootTemplate(active: [ActiveCall], recents: [RecentCall], agents: [Agent]) -> CPListTemplate {
        var sections: [CPListSection] = []

        // On a call now — the primary in-car action: take it over (transfer to
        // the saved callback number). Hands-free + glanceable while driving.
        if !active.isEmpty {
            let activeItems: [CPListItem] = active.map { call in
                let title = call.customerNumber ?? call.label ?? "Active call"
                let item = CPListItem(text: "Take this call", detailText: title)
                item.handler = { [weak self] _, completion in
                    Task {
                        await self?.takeCall(callId: call.callId)
                        completion()
                    }
                }
                return item
            }
            sections.append(CPListSection(items: activeItems, header: "On a call now", sectionIndexTitle: nil))
        }

        // Call a recent number back — the safe driving callback action.
        let recentItems: [CPListItem] = recents.compactMap { call in
            guard let number = call.customerNumber else { return nil }
            let item = CPListItem(text: number, detailText: call.summary)
            item.handler = { [weak self] _, completion in
                Task {
                    await self?.callBack(number: number, agentId: call.agentId ?? agents.first?.id)
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
        return CPListTemplate(title: "Wireline", sections: sections)
    }

    /// Transfer an active call to the user's saved callback number (CarPlay-safe).
    private func takeCall(callId: String) async {
        try? await WirelineAPI.shared.handoffCall(callId: callId, to: nil)
    }

    private func callBack(number: String, agentId: String?) async {
        guard let agentId else { return }
        _ = try? await WirelineAPI.shared.placeCall(agentId: agentId, to: number, context: nil)
    }
}
